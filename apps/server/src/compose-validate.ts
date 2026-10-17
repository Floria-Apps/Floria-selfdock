import { LineCounter, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, Pair, YAMLMap } from 'yaml';
import type { Issue } from '@shared/types';

/** A published port of a container that is already running. */
export interface UsedPort { port: number; proto: string }
export interface RunningContainer { name: string; project: string | null; ports: UsedPort[] }

export interface ValidateCtx {
  /** Compose project name (the stack folder name). Containers of this project are about to be replaced, so they never conflict. */
  project: string;
  /** Containers currently on the host, or null if Docker could not be reached. */
  running: RunningContainer[] | null;
}

/* ------------------------------------------------------------------ .env */

export function parseEnv(text: string): { vars: Map<string, string>; issues: Issue[] } {
  const vars = new Map<string, string>();
  const issues: Issue[] = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=(.*)$/.exec(line);
    if (!m) { issues.push({ level: 'error', code: 'env_syntax', file: 'env', line: i + 1, col: 1 }); return; }
    const [, key, rest] = m;
    let value = rest.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.lastIndexOf(quote) > 0) value = value.slice(1, value.lastIndexOf(quote));
    else value = value.replace(/\s+#.*$/, '');
    if (vars.has(key)) issues.push({ level: 'warning', code: 'env_duplicate', file: 'env', line: i + 1, col: 1, params: { name: key } });
    vars.set(key, value);
  });
  return { vars, issues };
}

/* --------------------------------------------------------- interpolation */

export interface Interpolated { value: string; missing: string[]; required: string[] }

/** Resolves `$VAR`, `${VAR}`, `${VAR:-default}`, `${VAR-default}`, `${VAR:+alt}` and `${VAR:?error}` like Compose does. */
export function interpolate(input: string, vars: Map<string, string>): Interpolated {
  const missing = new Set<string>();
  const required = new Set<string>();
  const value = input.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?+])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (all, braced: string | undefined, op: string | undefined, arg: string | undefined, plain: string | undefined) => {
      if (all === '$$') return '$';
      const name = braced ?? plain!;
      const cur = vars.get(name);
      const set = cur !== undefined;
      const nonEmpty = set && cur !== '';
      if (!op) { if (!set) missing.add(name); return cur ?? ''; }
      const colon = op.startsWith(':');
      const ok = colon ? nonEmpty : set;
      if (op.endsWith('-')) return ok ? cur! : arg ?? '';
      if (op.endsWith('+')) return ok ? arg ?? '' : '';
      if (!ok) required.add(name);          // ?
      return cur ?? '';
    });
  return { value, missing: [...missing], required: [...required] };
}

/* ------------------------------------------------------------- the check */

const WILDCARD = new Set(['', '0.0.0.0', '[::]', '::']);
const PORT_RE = /^(?:(?<ip>\[[^\]]*\]|[0-9.]+):)?(?<host>\d+(?:-\d+)?):(?<cont>\d+(?:-\d+)?)(?:\/(?<proto>tcp|udp|sctp))?$/i;

interface HostPort { port: number; proto: string; ip: string; line?: number; col?: number }

function expandRange(spec: string): number[] {
  const [a, b] = spec.split('-').map(Number);
  if (!Number.isFinite(b)) return [a];
  if (b < a || b - a > 64) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function sameBind(a: { ip: string }, b: { ip: string }) {
  return a.ip === b.ip || WILDCARD.has(a.ip) || WILDCARD.has(b.ip);
}

export function validateStack(composeText: string, envText: string | null, ctx: ValidateCtx): { issues: Issue[]; services: string[] } {
  const { vars, issues: envIssues } = parseEnv(envText ?? '');
  const issues: Issue[] = [...envIssues];
  const lc = new LineCounter();
  const doc = parseDocument(composeText, { lineCounter: lc });
  const pos = (node: unknown): { line?: number; col?: number } => {
    const range = (node as { range?: [number, number, number] } | null)?.range;
    if (!range) return {};
    const p = lc.linePos(range[0]);
    return { line: p.line, col: p.col };
  };
  const add = (level: Issue['level'], code: string, at: unknown, params?: Issue['params']) =>
    issues.push({ level, code, file: 'compose', ...pos(at), params });

  if (doc.errors.length) {
    for (const e of doc.errors) {
      const p = e.linePos?.[0];
      issues.push({ level: 'error', code: 'yaml_syntax', file: 'compose', line: p?.line, col: p?.col, params: { detail: e.message.split('\n')[0].replace(/\s+at line \d+, column \d+:?$/, '') } });
    }
    return { issues: sortIssues(issues), services: [] };
  }

  const root = doc.contents;
  const servicesNode = isMap(root) ? root.get('services', true) : null;
  if (!isMap(servicesNode) || servicesNode.items.length === 0) {
    issues.push({ level: 'error', code: 'no_services', file: 'compose', line: 1, col: 1 });
    return { issues: sortIssues(issues), services: [] };
  }
  if (isMap(root) && root.has('version')) add('info', 'version_obsolete', root.get('version', true));

  const used = new Map<string, UsedPort[]>();
  for (const c of ctx.running ?? []) if (c.project !== ctx.project) used.set(c.name, c.ports);
  const allUsed = [...used.entries()].flatMap(([by, ports]) => ports.map(p => ({ ...p, by })));
  const taken = new Set<string>(allUsed.map(p => `${p.proto}:${p.port}`));

  const services: string[] = [];
  const fileNames = new Map<string, string>();
  const filePorts: (HostPort & { service: string })[] = [];

  for (const pair of servicesNode.items as Pair<Node, Node>[]) {
    const name = String(isScalar(pair.key) ? pair.key.value : pair.key);
    services.push(name);
    const svc = pair.value;
    if (!isMap(svc)) { add('error', 'service_invalid', pair.key, { service: name }); continue; }

    if (!svc.has('image') && !svc.has('build')) add('error', 'service_no_image', pair.key, { service: name });

    const imageNode = svc.get('image', true);
    if (isScalar(imageNode) && typeof imageNode.value === 'string') {
      const r = interpolate(imageNode.value, vars);
      if (r.missing.length === 0 && !r.value.includes('@')) {
        const last = r.value.split('/').pop() ?? '';
        const tag = last.includes(':') ? last.split(':')[1] : '';
        if (!tag || tag === 'latest') add('info', 'image_latest', imageNode, { service: name, image: r.value });
      }
    }
    if (!svc.has('restart') && !svc.has('deploy')) add('info', 'no_restart', pair.key, { service: name });
    if (svc.get('privileged') === true) add('warning', 'privileged', svc.get('privileged', true), { service: name });

    const vols = svc.get('volumes', true);
    if (isSeq(vols)) {
      for (const v of vols.items) {
        const text = isScalar(v) ? String(v.value) : isMap(v) ? String(v.get('source') ?? '') : '';
        if (/(^|[:/])\/(var\/)?run\/docker\.sock/.test(text) || text.includes('/docker.sock')) add('warning', 'docker_sock', v, { service: name });
      }
    }

    const cn = svc.get('container_name', true);
    if (isScalar(cn) && typeof cn.value === 'string') {
      const cname = interpolate(cn.value, vars).value;
      if (fileNames.has(cname)) add('error', 'container_name_duplicate', cn, { name: cname });
      fileNames.set(cname, name);
      if (used.has(cname)) add('error', 'container_name_in_use', cn, { name: cname });
    }

    const ports = svc.get('ports', true);
    if (isSeq(ports)) {
      for (const item of ports.items) {
        const found: HostPort[] = [];
        if (isScalar(item)) {
          const r = interpolate(String(item.value), vars);
          if (r.missing.length || r.required.length) continue;      // already reported as a missing variable
          const m = PORT_RE.exec(r.value.trim());
          if (!m?.groups) continue;
          const proto = (m.groups.proto ?? 'tcp').toLowerCase();
          for (const port of expandRange(m.groups.host)) found.push({ port, proto, ip: m.groups.ip ?? '', ...pos(item) });
        } else if (isMap(item)) {
          const published = item.get('published');
          if (published === undefined || published === null) continue;
          const r = interpolate(String(published), vars);
          if (r.missing.length || r.required.length) continue;
          for (const port of expandRange(r.value)) {
            found.push({ port, proto: String(item.get('protocol') ?? 'tcp').toLowerCase(), ip: String(item.get('host_ip') ?? ''), ...pos(item) });
          }
        }
        for (const hp of found) {
          if (filePorts.some(o => o.port === hp.port && o.proto === hp.proto && sameBind(o, hp))) {
            issues.push({ level: 'error', code: 'port_duplicate', file: 'compose', line: hp.line, col: hp.col, params: { port: hp.port } });
          }
          filePorts.push({ ...hp, service: name });
          const clash = allUsed.find(u => u.port === hp.port && u.proto === hp.proto);
          if (clash) {
            let suggest = hp.port + 1;
            while (taken.has(`${hp.proto}:${suggest}`) || filePorts.some(o => o.port === suggest && o.proto === hp.proto)) suggest++;
            issues.push({ level: 'warning', code: 'port_in_use', file: 'compose', line: hp.line, col: hp.col, params: { port: hp.port, by: clash.by, suggest } });
          }
        }
      }
    }
  }

  // ${VAR} used without a default, but not defined in .env
  const seen = new Set<string>();
  const refs = /\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-?+][^}]*)?\}/g;
  for (let m = refs.exec(composeText); m; m = refs.exec(composeText)) {
    if (m[0] === '$$' || !m[1] || vars.has(m[1]) || seen.has(m[1])) continue;
    const p = lc.linePos(m.index);
    if (!m[2]) { seen.add(m[1]); issues.push({ level: 'warning', code: 'env_missing', file: 'compose', line: p.line, col: p.col, params: { name: m[1] } }); }
    else if (m[2].includes('?')) { seen.add(m[1]); issues.push({ level: 'error', code: 'env_required', file: 'compose', line: p.line, col: p.col, params: { name: m[1] } }); }
  }

  return { issues: sortIssues(issues), services };
}

const ORDER = { error: 0, warning: 1, info: 2 } as const;
function sortIssues(list: Issue[]): Issue[] {
  return list.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.file === b.file ? 0 : a.file === 'compose' ? -1 : 1) || (a.line ?? 0) - (b.line ?? 0));
}

/** Names of the services in a compose file, or [] if it cannot be read. */
export function listServices(composeText: string): string[] {
  try {
    const doc = parseDocument(composeText);
    const svc = isMap(doc.contents) ? (doc.contents as YAMLMap).get('services', true) : null;
    return isMap(svc) ? (svc.items as Pair[]).map(p => String(isScalar(p.key) ? p.key.value : p.key)) : [];
  } catch { return []; }
}
