import os from 'node:os';
import type { Action, Alert, Cause, DockerState, Metrics, ServerMsg, Service, Status } from '@shared/types';
import { CATEGORY_IDS } from '@shared/categories';
import { getSetting, numSetting, setSetting, type DB } from './db';
import { DockerClient, DockerError, type DockerContainer, type DockerEvent } from './docker';
import { displayNameFor, iconCandidates, knownFor, prettifyName } from './catalog';
import type { IconStore } from './icons';
import type { MetricsCollector } from './metrics';
import type { Hub } from './hub';
import { HttpError } from './errors';
import { listIncidents, computeAvailability } from './history';
import type { RunningContainer } from './compose-validate';

interface Override { name: string | null; icon: string | null; category: string | null; hidden: boolean }
interface ManualRow { id: number; name: string; url: string; description: string }
interface DieInfo { exitCode: number; oom: boolean; at: number }

const SELF_ID = os.hostname();
const PENDING_STATUS: Record<Action, Status> = { start: 'starting', stop: 'stopping', restart: 'restarting' };
const WEBISH_PORTS = [80, 8080, 8000, 3000, 8096, 8123, 5000, 443];
const UPDATE_CHECK_TTL = 6 * 60 * 60 * 1000;
const UNKNOWN_CHECK_TTL = 15 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function mapStatus(state: string, status: string): Status {
  switch (state) {
    case 'running':
      if (/\(unhealthy\)/i.test(status)) return 'unhealthy';
      if (/health: starting/i.test(status)) return 'starting';
      return 'online';
    case 'restarting': return 'restarting';
    case 'paused': return 'paused';
    default: return 'offline';
  }
}

export function pickPort(c: DockerContainer): number | null {
  const fromLabel = Number(c.Labels?.['floria.port']);
  if (Number.isInteger(fromLabel) && fromLabel > 0 && fromLabel < 65536) return fromLabel;
  const pub = (c.Ports ?? []).filter(p => p.Type === 'tcp' && p.PublicPort);
  if (!pub.length) return null;
  for (const web of WEBISH_PORTS) {
    const hit = pub.find(p => p.PrivatePort === web);
    if (hit) return hit.PublicPort!;
  }
  return Math.min(...pub.map(p => p.PublicPort!));
}

/** Turns the last `die` event into a cause code the dashboard can translate. */
export function deathCause(d: DieInfo | undefined): Cause | null {
  if (!d || Date.now() - d.at > 5 * 60 * 1000) return null;
  if (d.oom) return 'oom';
  if (d.exitCode === 137) return 'killed';
  if (d.exitCode === 143) return 'sigterm';
  if (d.exitCode === 0) return 'exit0';
  return `exit:${d.exitCode}`;
}

export function dockerState(e: unknown): DockerState {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return { ok: false, code: 'socket_not_found' };
  if (code === 'EACCES') return { ok: false, code: 'permission_denied' };
  if (code === 'ECONNREFUSED') return { ok: false, code: 'connection_refused' };
  return { ok: false, code: 'other', detail: e instanceof Error ? e.message : String(e) };
}

export interface RegistryDeps {
  db: DB; docker: DockerClient; hub: Hub; icons: IconStore; metrics: MetricsCollector;
}

export class Registry {
  private services = new Map<string, Service>();
  private raw = new Map<string, DockerContainer>();
  private manualRows = new Map<string, ManualRow>();
  private manualStatus = new Map<string, Status>();
  private overrides = new Map<string, Override>();
  private pending = new Map<string, { action: Action; timer: NodeJS.Timeout }>();
  private planned = new Set<string>();
  private lastDie = new Map<string, DieInfo>();
  private lastAvail = new Map<string, boolean>();
  private iconFiles = new Map<string, string | null>();
  private iconWork = new Set<string>();
  private imageUpdates = new Map<string, Service['imageUpdateStatus']>();
  private imageUpdateChecked = new Map<string, number>();
  private imageUpdateWork = new Set<string>();
  private debounce = new Map<string, NodeJS.Timeout>();
  private timers = new Set<NodeJS.Timeout>();
  private abort = new AbortController();
  private alerts: Alert[] = [];
  private alertsJson = '[]';
  dockerState: DockerState = { ok: false };
  metrics: Metrics | null = null;

  constructor(private d: RegistryDeps) {}

  /* ---------------- lifecycle ---------------- */

  async start() {
    if (!getSetting(this.d.db, 'tracking_started')) setSetting(this.d.db, 'tracking_started', String(Date.now()));
    this.d.db.prepare('DELETE FROM restarts WHERE at < ?').run(Date.now() - 7 * 24 * 3600 * 1000);
    this.loadOverrides();
    this.loadManual();
    await this.syncDocker();
    await this.tickMetrics();
    this.every(30_000, () => void this.syncDocker());
    this.loop(() => numSetting(this.d.db, 'metrics_interval', 5) * 1000, () => this.tickMetrics());
    this.loop(() => numSetting(this.d.db, 'check_interval', 30) * 1000, () => this.checkManual());
    void this.eventLoop();
  }

  stop() {
    this.abort.abort();
    for (const t of this.timers) { clearInterval(t); clearTimeout(t); }
    for (const p of this.pending.values()) clearTimeout(p.timer);
  }

  private every(ms: number, fn: () => void) { this.timers.add(setInterval(fn, ms)); }

  private loop(interval: () => number, fn: () => Promise<void>) {
    const run = async () => {
      if (this.abort.signal.aborted) return;
      try { await fn(); } catch { /* try again on the next cycle */ }
      this.timers.add(setTimeout(run, interval()));
    };
    this.timers.add(setTimeout(run, interval()));
  }

  snapshot(): ServerMsg {
    return { type: 'snapshot', services: [...this.services.values()], metrics: this.metrics, alerts: this.alerts, docker: this.dockerState };
  }

  list() { return [...this.services.values()]; }

  /* ---------------- Docker ---------------- */

  private setDocker(next: DockerState) {
    if (JSON.stringify(this.dockerState) === JSON.stringify(next)) return;
    this.dockerState = next;
    this.d.hub.broadcast({ type: 'docker', docker: next });
  }

  async syncDocker() {
    try {
      const list = await this.d.docker.listContainers();
      this.setDocker({ ok: true });
      const seen = new Set<string>();
      for (const c of list) { const k = this.upsertRaw(c); if (k) seen.add(k); }
      for (const [k, s] of this.services) if (s.source === 'docker' && !seen.has(k)) this.removeService(k);
      void this.checkImageUpdates(list.filter(c => {
        const name = (c.Names?.[0] ?? c.Id).replace(/^\//, '');
        return this.raw.has(`docker:${name}`);
      }));
    } catch (e) {
      this.setDocker(dockerState(e));
    }
  }

  private async syncOne(id: string) {
    try {
      const c = await this.d.docker.listOne(id);
      if (c) {
        if (this.upsertRaw(c)) void this.checkImageUpdates([c]);
      }
      else this.removeById(id);
    } catch { /* the 30 s full sync will catch up */ }
  }

  private async checkImageUpdates(containers: DockerContainer[]) {
    const refs = new Set(containers.map(c => c.Image).filter(Boolean));
    const check = async (reference: string) => {
      const checkedAt = this.imageUpdateChecked.get(reference) ?? 0;
      const ttl = this.imageUpdates.get(reference) === 'unknown' ? UNKNOWN_CHECK_TTL : UPDATE_CHECK_TTL;
      if (this.imageUpdateWork.has(reference) || Date.now() - checkedAt < ttl) return;
      this.imageUpdateWork.add(reference);
      this.imageUpdates.set(reference, 'checking');
      this.updateImageServices(reference);
      try {
        const status = await this.d.docker.imageUpdateStatus(reference);
        this.imageUpdates.set(reference, status);
      } catch (error) {
        this.imageUpdates.set(reference, 'unknown');
        console.warn(`Could not check for an update to Docker image "${reference}".`, error);
      } finally {
        this.imageUpdateChecked.set(reference, Date.now());
        this.imageUpdateWork.delete(reference);
        this.updateImageServices(reference);
      }
    };
    const pending = [...refs].filter(reference => !this.imageUpdateWork.has(reference)
      && Date.now() - (this.imageUpdateChecked.get(reference) ?? 0)
        >= (this.imageUpdates.get(reference) === 'unknown' ? UNKNOWN_CHECK_TTL : UPDATE_CHECK_TTL));
    for (let i = 0; i < pending.length; i += 4) await Promise.all(pending.slice(i, i + 4).map(check));
  }

  private updateImageServices(reference: string) {
    for (const [key, container] of this.raw) {
      if (container.Image === reference) this.rebuild(key);
    }
  }

  private async eventLoop() {
    let delay = 1000;
    while (!this.abort.signal.aborted) {
      try {
        await this.d.docker.events(ev => this.onEvent(ev), this.abort.signal, () => { delay = 1000; });
      } catch (e) {
        if (this.abort.signal.aborted) return;
        this.setDocker(dockerState(e));
      }
      if (this.abort.signal.aborted) return;
      await sleep(delay);
      delay = Math.min(delay * 2, 30_000);
      await this.syncDocker();
    }
  }

  onEvent(ev: DockerEvent) {
    if (ev.Type !== 'container') return;
    const id = ev.Actor?.ID;
    const attrs = ev.Actor?.Attributes ?? {};
    const key = attrs.name ? `docker:${attrs.name}` : '';
    const action = ev.Action.split(':')[0];

    if (action === 'die' && key) {
      const prev = this.lastDie.get(key);
      const oom = !!prev?.oom && Date.now() - prev.at < 10_000; // the "oom" event arrives before "die"
      this.lastDie.set(key, { exitCode: Number(attrs.exitCode ?? 0), oom, at: Date.now() });
      if (!this.planned.has(key) && !this.pending.has(key)) {
        this.d.db.prepare('INSERT INTO restarts(service_key, at) VALUES(?, ?)').run(key, Date.now());
      }
    } else if (action === 'oom' && key) {
      const prev = this.lastDie.get(key);
      this.lastDie.set(key, { exitCode: prev?.exitCode ?? 137, oom: true, at: Date.now() });
    }
    if (action === 'destroy') { this.removeById(id); return; }
    if (!id) return;
    clearTimeout(this.debounce.get(id));
    this.debounce.set(id, setTimeout(() => { this.debounce.delete(id); void this.syncOne(id); }, 150));
  }

  /** Every container on the host (also hidden ones), with the ports they publish. Used to check a compose file for clashes. */
  async containersOverview(): Promise<RunningContainer[]> {
    const list = await this.d.docker.listContainers();
    return list.map(c => ({
      name: (c.Names?.[0] ?? c.Id).replace(/^\//, ''),
      project: c.Labels?.['com.docker.compose.project'] ?? null,
      // Stopped containers keep their name but not their ports.
      ports: c.State === 'running' || c.State === 'restarting' || c.State === 'paused'
        ? (c.Ports ?? []).filter(p => p.PublicPort).map(p => ({ port: p.PublicPort!, proto: p.Type }))
        : [],
    }));
  }

  /** Running and total containers per compose project. */
  async projectCounts(): Promise<Map<string, { running: number; total: number }>> {
    const out = new Map<string, { running: number; total: number }>();
    for (const c of await this.d.docker.listContainers()) {
      const project = c.Labels?.['com.docker.compose.project'];
      if (!project) continue;
      const cur = out.get(project) ?? { running: 0, total: 0 };
      cur.total++;
      if (c.State === 'running') cur.running++;
      out.set(project, cur);
    }
    return out;
  }

  /* ---------------- building services ---------------- */

  private upsertRaw(c: DockerContainer): string | null {
    const name = (c.Names?.[0] ?? c.Id).replace(/^\//, '');
    const key = `docker:${name}`;
    if (c.Labels?.['floria.hide'] === 'true' || (SELF_ID.length >= 12 && c.Id.startsWith(SELF_ID))) return null;
    for (const [k, r] of this.raw) if (r.Id === c.Id && k !== key) this.removeService(k); // renamed container
    this.raw.set(key, c);
    this.put(this.build(key));
    return key;
  }

  private rebuild(key: string) {
    const s = this.build(key);
    if (s) this.put(s);
  }

  private resolveIcon(candidates: string[]): string | null {
    const cacheKey = candidates.join('|');
    if (!candidates.length) return null;
    if (this.iconFiles.has(cacheKey)) return this.iconFiles.get(cacheKey) ?? null;
    if (!this.iconWork.has(cacheKey)) {
      this.iconWork.add(cacheKey);
      void this.d.icons.firstMatch(candidates).then(file => {
        this.iconFiles.set(cacheKey, file);
        this.iconWork.delete(cacheKey);
        if (file) for (const k of [...this.raw.keys(), ...this.manualRows.keys()]) this.rebuild(k);
      });
    }
    return null;
  }

  private build(key: string): Service | null {
    const c = this.raw.get(key);
    if (c) return this.buildDocker(key, c);
    const row = this.manualRows.get(key);
    if (row) return this.buildManual(key, row);
    return null;
  }

  private buildDocker(key: string, c: DockerContainer): Service {
    const L = c.Labels ?? {};
    const name = key.slice('docker:'.length);
    const composeService = L['com.docker.compose.service'];
    const ov = this.overrides.get(key);
    const auto = iconCandidates({ label: L['floria.icon'], image: c.Image, composeService, name });
    const known = knownFor(auto);
    const pending = this.pending.get(key);
    const labelCat = L['floria.category'];
    return {
      id: key,
      source: 'docker',
      name: ov?.name || L['floria.name'] || displayNameFor(auto) || prettifyName(composeService || name),
      description: L['floria.description'] || (known ? '' : c.Image.split('@')[0].replace(/^.*\//, '')),
      catalog: known?.key ?? null,
      icon: this.resolveIcon(ov?.icon ? [ov.icon] : auto),
      category: ov?.category || (labelCat && CATEGORY_IDS.includes(labelCat) ? labelCat : null) || known?.category || 'other',
      port: pickPort(c),
      url: L['floria.url'] || null,
      image: c.Image,
      imageUpdateStatus: this.imageUpdates.get(c.Image) ?? 'checking',
      status: pending ? PENDING_STATUS[pending.action] : mapStatus(c.State, c.Status),
      hidden: !!ov?.hidden,
    };
  }

  private buildManual(key: string, row: ManualRow): Service {
    const ov = this.overrides.get(key);
    const auto = iconCandidates({ name: row.name });
    const known = knownFor(auto);
    let port: number | null = null;
    try { const u = new URL(row.url); port = u.port ? Number(u.port) : null; } catch { /* invalid URL */ }
    return {
      id: key,
      source: 'manual',
      name: ov?.name || row.name,
      description: row.description,
      catalog: known?.key ?? null,
      icon: this.resolveIcon(ov?.icon ? [ov.icon] : auto),
      category: ov?.category || known?.category || 'other',
      port,
      url: row.url,
      image: null,
      status: this.manualStatus.get(key) ?? 'starting',
      hidden: !!ov?.hidden,
    };
  }

  private put(next: Service | null) {
    if (!next) return;
    const prev = this.services.get(next.id);
    this.services.set(next.id, next);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      this.d.hub.broadcast({ type: 'service.upsert', service: next });
    }
    if (!this.pending.has(next.id)) this.observe(next);
    this.refreshAlerts();
  }

  private removeService(key: string) {
    this.raw.delete(key);
    if (this.services.delete(key)) this.d.hub.broadcast({ type: 'service.remove', id: key });
    this.lastAvail.delete(key);
    this.closeIncidents(key);
    this.refreshAlerts();
  }

  private removeById(id: string) {
    for (const [k, r] of this.raw) if (r.Id === id) this.removeService(k);
  }

  /* ---------------- downtime and history ---------------- */

  private observe(s: Service) {
    const avail = s.status === 'online';
    const was = this.lastAvail.get(s.id);
    this.lastAvail.set(s.id, avail);
    if (was === undefined) {
      // First time we see this app in this run. We never invent a downtime, but if the app is already up and an
      // incident was left open (from before SelfDock restarted), that incident is over.
      if (avail) this.closeIncidents(s.id);
      return;
    }
    if (was && !avail) {
      const planned = this.planned.delete(s.id);
      const cause = planned ? 'user' : s.status === 'unhealthy' ? 'unhealthy' : deathCause(this.lastDie.get(s.id));
      this.d.db.prepare('INSERT INTO incidents(service_key, service_name, kind, planned, cause, started_at) VALUES(?, ?, ?, ?, ?, ?)')
        .run(s.id, s.name, s.status, planned ? 1 : 0, cause, Date.now());
      this.d.hub.broadcast({ type: 'history.changed' });
    } else if (!was && avail) {
      this.closeIncidents(s.id);
    }
  }

  private closeIncidents(key: string) {
    const r = this.d.db.prepare('UPDATE incidents SET ended_at = ? WHERE service_key = ? AND ended_at IS NULL').run(Date.now(), key);
    if (r.changes) {
      this.d.db.prepare('DELETE FROM dismissed WHERE alert_id = ?').run(`down:${key}`);
      this.d.hub.broadcast({ type: 'history.changed' });
    }
  }

  history(limit = 100) {
    const tracked = Number(getSetting(this.d.db, 'tracking_started')) || Date.now();
    return {
      incidents: listIncidents(this.d.db, limit),
      availability: computeAvailability(this.d.db, this.list().filter(s => !s.hidden), tracked),
      trackedSince: tracked,
    };
  }

  /* ---------------- alerts ---------------- */

  private computeAlerts(): Alert[] {
    const now = Date.now();
    const out: Alert[] = [];
    const m = this.metrics;
    if (m?.disk.total && m.disk.percent >= 85) {
      out.push({
        id: 'disk', kind: 'disk', level: m.disk.percent >= 95 ? 'error' : 'warning', icon: 'hard_drive', at: m.at,
        params: { percent: Math.round(m.disk.percent), free: m.disk.total - m.disk.used },
      });
    }
    if (m && m.ram.percent >= 92) {
      out.push({ id: 'ram', kind: 'ram', level: 'warning', icon: 'memory', at: m.at, params: { percent: Math.round(m.ram.percent) } });
    }
    const nameOf = (key: string) => this.services.get(key)?.name ?? key.replace(/^(docker|manual):/, '');
    const visible = (key: string) => { const s = this.services.get(key); return !!s && !s.hidden; };

    const loops = this.d.db.prepare('SELECT service_key, COUNT(*) AS c, MAX(at) AS last FROM restarts WHERE at > ? GROUP BY service_key HAVING c >= 3')
      .all(now - 3600_000) as unknown as { service_key: string; c: number; last: number }[];
    for (const r of loops) {
      if (!visible(r.service_key)) continue;
      out.push({
        id: `loop:${r.service_key}`, kind: 'loop', level: 'warning', icon: 'restart_alt', at: r.last,
        params: { name: nameOf(r.service_key), count: r.c },
        action: { kind: 'logs', serviceId: r.service_key },
      });
    }
    const open = this.d.db.prepare('SELECT service_key, kind, cause, started_at FROM incidents WHERE ended_at IS NULL AND planned = 0')
      .all() as unknown as { service_key: string; kind: string; cause: string | null; started_at: number }[];
    for (const r of open) {
      if (!visible(r.service_key)) continue;
      const unhealthy = r.kind === 'unhealthy';
      const isDocker = r.service_key.startsWith('docker:');
      out.push({
        id: `down:${r.service_key}`, kind: unhealthy ? 'unhealthy' : 'down', level: 'error', icon: unhealthy ? 'heart_broken' : 'error', at: r.started_at,
        params: { name: nameOf(r.service_key), cause: r.cause ?? '' },
        action: isDocker ? { kind: 'logs', serviceId: r.service_key } : { kind: 'history' },
      });
    }
    const dismissed = new Set((this.d.db.prepare('SELECT alert_id FROM dismissed WHERE until > ?').all(now) as unknown as { alert_id: string }[]).map(r => r.alert_id));
    return out.filter(a => !dismissed.has(a.id)).sort((a, b) => b.at - a.at);
  }

  private refreshAlerts() {
    const next = this.computeAlerts();
    const json = JSON.stringify(next);
    if (json === this.alertsJson) return;
    this.alertsJson = json;
    this.alerts = next;
    this.d.hub.broadcast({ type: 'alerts', alerts: next });
  }

  dismissAlert(id: string) {
    this.d.db.prepare('INSERT INTO dismissed(alert_id, until) VALUES(?, ?) ON CONFLICT(alert_id) DO UPDATE SET until = excluded.until')
      .run(id, Date.now() + 24 * 3600 * 1000);
    this.refreshAlerts();
  }

  /* ---------------- metrics and manual services ---------------- */

  async tickMetrics() {
    const docker = this.list().filter(s => s.source === 'docker');
    this.metrics = await this.d.metrics.sample({ running: docker.filter(s => s.status === 'online').length, total: docker.length });
    this.d.hub.broadcast({ type: 'metrics', metrics: this.metrics });
    this.refreshAlerts();
  }

  private loadManual() {
    const rows = this.d.db.prepare('SELECT id, name, url, description FROM manual_services').all() as unknown as ManualRow[];
    for (const r of rows) {
      const key = `manual:${r.id}`;
      this.manualRows.set(key, r);
      this.put(this.buildManual(key, r));
    }
  }

  async checkManual() {
    await Promise.all([...this.manualRows.entries()].map(async ([key, row]) => {
      let status: Status = 'offline';
      try {
        const res = await fetch(row.url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
        status = res.status < 500 ? 'online' : 'offline';
        void res.body?.cancel();
      } catch { /* no response means it is down */ }
      this.manualStatus.set(key, status);
      this.rebuild(key);
    }));
  }

  async addManual(input: { name: string; url: string; description?: string; category?: string; icon?: string }) {
    const r = this.d.db.prepare('INSERT INTO manual_services(name, url, description, created_at) VALUES(?, ?, ?, ?)')
      .run(input.name, input.url, input.description ?? '', Date.now());
    const id = Number(r.lastInsertRowid);
    const key = `manual:${id}`;
    if (input.category || input.icon) await this.patch(key, { category: input.category, icon: input.icon }, false);
    this.manualRows.set(key, { id, name: input.name, url: input.url, description: input.description ?? '' });
    this.put(this.buildManual(key, this.manualRows.get(key)!));
    void this.checkManual();
    return this.services.get(key)!;
  }

  removeManual(key: string) {
    if (!this.manualRows.has(key)) throw new HttpError(400, 'Only services added by hand can be removed. Docker containers can be hidden instead.', 'manual_only');
    this.d.db.prepare('DELETE FROM manual_services WHERE id = ?').run(Number(key.split(':')[1]));
    this.d.db.prepare('DELETE FROM overrides WHERE service_key = ?').run(key);
    this.manualRows.delete(key);
    this.manualStatus.delete(key);
    this.overrides.delete(key);
    this.removeService(key);
  }

  /* ---------------- customisation ---------------- */

  private loadOverrides() {
    const rows = this.d.db.prepare('SELECT service_key, name, icon, category, hidden FROM overrides').all() as unknown as
      { service_key: string; name: string | null; icon: string | null; category: string | null; hidden: number }[];
    this.overrides.clear();
    for (const r of rows) this.overrides.set(r.service_key, { name: r.name, icon: r.icon, category: r.category, hidden: !!r.hidden });
  }

  async patch(key: string, body: { name?: string; icon?: string; category?: string; hidden?: boolean }, rebuild = true) {
    if (rebuild && !this.services.has(key)) throw new HttpError(404, 'App not found.', 'service_not_found');
    const cur = this.overrides.get(key) ?? { name: null, icon: null, category: null, hidden: false };
    const next: Override = { ...cur };
    if (body.name !== undefined) next.name = body.name.trim() || null;
    if (body.category !== undefined) next.category = body.category || null;
    if (body.hidden !== undefined) next.hidden = body.hidden;
    if (body.icon !== undefined) {
      if (!body.icon.trim()) next.icon = null;
      else {
        const file = await this.d.icons.ensure(body.icon);
        if (!file) throw new HttpError(400, `Icon "${body.icon}" not found. Check the name in dashboard-icons.`, 'icon_not_found');
        next.icon = body.icon.trim().toLowerCase();
        this.iconFiles.set([next.icon].join('|'), file);
      }
    }
    this.d.db.prepare(
      `INSERT INTO overrides(service_key, name, icon, category, hidden) VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(service_key) DO UPDATE SET name = excluded.name, icon = excluded.icon, category = excluded.category, hidden = excluded.hidden`,
    ).run(key, next.name, next.icon, next.category, next.hidden ? 1 : 0);
    this.overrides.set(key, next);
    if (rebuild) { this.rebuild(key); this.refreshAlerts(); }
  }

  /* ---------------- actions ---------------- */

  async act(key: string, action: Action) {
    const c = this.raw.get(key);
    if (!c) throw new HttpError(404, 'App not found.', 'service_not_found');
    if (this.pending.has(key)) throw new HttpError(409, 'An action is already in progress for this app.', 'action_in_progress');
    if (action === 'stop') this.planned.add(key);
    const timer = setTimeout(() => { this.pending.delete(key); this.rebuild(key); }, 100_000);
    this.pending.set(key, { action, timer });
    this.rebuild(key);
    try {
      await this.d.docker.action(c.Id, action);
    } catch (e) {
      if (action === 'stop') this.planned.delete(key);
      throw new HttpError(502, e instanceof DockerError ? `Docker refused: ${e.message}` : 'Could not reach Docker.', 'docker_failed');
    } finally {
      clearTimeout(timer);
      this.pending.delete(key);
      await this.syncOne(c.Id);
    }
  }

  async logs(key: string, tail: number): Promise<string> {
    const c = this.raw.get(key);
    if (!c) throw new HttpError(404, 'Only Docker containers have logs.', 'logs_docker_only');
    try { return await this.d.docker.logs(c.Id, tail); }
    catch { throw new HttpError(502, 'Could not read the logs from Docker.', 'docker_failed'); }
  }
}
