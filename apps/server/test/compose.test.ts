import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { interpolate, parseEnv, validateStack, type RunningContainer } from '../src/compose-validate';
import { StackStore } from '../src/stacks';
import { StackJobs } from '../src/stack-jobs';
import type { Hub } from '../src/hub';
import type { ServerMsg } from '@shared/types';

const codes = (r: { issues: { code: string }[] }) => r.issues.map(i => i.code);
const find = (r: { issues: { code: string }[] }, code: string) => r.issues.find(i => i.code === code) as { code: string; line?: number; params?: Record<string, string | number> } | undefined;
const pihole: RunningContainer = { name: 'pihole', project: null, ports: [{ port: 8081, proto: 'tcp' }, { port: 53, proto: 'udp' }] };

test('.env: comments, quotes, export, inline comments, duplicates and bad lines', () => {
  const { vars, issues } = parseEnv('# c\nA=1\nexport B="two words"  # note\nC=\'x\'\nD=val # inline\nA=2\nnot a line\n');
  assert.equal(vars.get('A'), '2'); assert.equal(vars.get('B'), 'two words'); assert.equal(vars.get('C'), 'x'); assert.equal(vars.get('D'), 'val');
  assert.deepEqual(issues.map(i => [i.code, i.line]), [['env_duplicate', 6], ['env_syntax', 7]]);
});

test('interpolation follows Compose rules', () => {
  const v = new Map([['SET', 'a'], ['EMPTY', '']]);
  assert.equal(interpolate('${SET}-${MISSING:-d}-${EMPTY:-e}-${EMPTY-f}', v).value, 'a-d-e-');
  assert.equal(interpolate('$SET $$ ${SET:+yes}${MISSING:+no}', v).value, 'a $ yes');
  assert.deepEqual(interpolate('${NOPE}', v).missing, ['NOPE']);
  assert.deepEqual(interpolate('${NOPE:?needed}', v).required, ['NOPE']);
});

test('reports YAML errors with a line number', () => {
  const r = validateStack('services:\n  web:\n    image: nginx\n   bad: x\n', null, { project: 'p', running: [] });
  const e = find(r, 'yaml_syntax');
  assert.ok(e && e.line === 4, `expected a YAML error on line 4, got ${JSON.stringify(r.issues)}`);
});

test('needs services and an image or build for each one', () => {
  assert.deepEqual(codes(validateStack('foo: bar\n', null, { project: 'p', running: [] })), ['no_services']);
  const r = validateStack('services:\n  web:\n    restart: always\n  api:\n    build: .\n    restart: always\n', null, { project: 'p', running: [] });
  assert.deepEqual(codes(r), ['service_no_image']);
  assert.deepEqual(r.services, ['web', 'api']);
});

test('port already used by another container: warns and suggests a free port', () => {
  const r = validateStack('services:\n  kuma:\n    image: kuma:1\n    restart: always\n    ports:\n      - "8081:3001"\n', null, { project: 'monitoring', running: [pihole] });
  const w = find(r, 'port_in_use')!;
  assert.equal(w.params?.port, 8081); assert.equal(w.params?.by, 'pihole'); assert.equal(w.params?.suggest, 8082); assert.equal(w.line, 6);
});

test("containers of the same project are being replaced, so they never clash", () => {
  const same: RunningContainer = { name: 'monitoring-kuma-1', project: 'monitoring', ports: [{ port: 8081, proto: 'tcp' }] };
  const r = validateStack('services:\n  kuma:\n    image: kuma:1\n    restart: always\n    ports: ["8081:3001"]\n', null, { project: 'monitoring', running: [same] });
  assert.ok(!codes(r).includes('port_in_use'));
});

test('ports use values from .env, defaults, long syntax and ranges; tcp and udp are separate', () => {
  const base = (ports: string) => `services:\n  a:\n    image: x:1\n    restart: always\n    ports:\n${ports}`;
  const ctx = { project: 'p', running: [pihole] };
  assert.ok(codes(validateStack(base('      - "${P:-8081}:80"\n'), null, ctx)).includes('port_in_use'), 'default value is used');
  assert.ok(!codes(validateStack(base('      - "${P:-8081}:80"\n'), 'P=9000\n', ctx)).includes('port_in_use'), '.env overrides the default');
  assert.ok(codes(validateStack(base('      - target: 80\n        published: 8081\n'), null, ctx)).includes('port_in_use'), 'long syntax');
  assert.ok(codes(validateStack(base('      - "8080-8082:80-82"\n'), null, ctx)).includes('port_in_use'), 'range');
  assert.ok(!codes(validateStack(base('      - "53:53/tcp"\n'), null, ctx)).includes('port_in_use'), 'pihole only holds 53/udp');
  assert.ok(codes(validateStack(base('      - "53:53/udp"\n'), null, ctx)).includes('port_in_use'));
  assert.ok(!codes(validateStack(base('      - "9000:80"\n'), null, ctx)).includes('port_in_use'));
});

test('duplicate host ports inside the file', () => {
  const r = validateStack('services:\n  a:\n    image: x:1\n    restart: always\n    ports: ["9000:80"]\n  b:\n    image: y:1\n    restart: always\n    ports: ["9000:81"]\n', null, { project: 'p', running: [] });
  assert.ok(codes(r).includes('port_duplicate'));
  const ok = validateStack('services:\n  a:\n    image: x:1\n    restart: always\n    ports: ["127.0.0.1:9000:80", "127.0.0.2:9000:80"]\n', null, { project: 'p', running: [] });
  assert.ok(!codes(ok).includes('port_duplicate'), 'same port on different host addresses is fine');
});

test('variables used but not defined in .env', () => {
  const r = validateStack('services:\n  a:\n    image: x:1\n    restart: always\n    ports: ["${GRAFANA_PORT}:3000"]\n    environment:\n      K: ${REQUIRED:?set it}\n      OK: ${HAS_DEFAULT:-1}\n', 'TZ=UTC\n', { project: 'p', running: [pihole] });
  assert.equal(find(r, 'env_missing')?.params?.name, 'GRAFANA_PORT');
  assert.equal(find(r, 'env_required')?.params?.name, 'REQUIRED');
  assert.ok(!r.issues.some(i => i.params?.name === 'HAS_DEFAULT'));
  assert.ok(!codes(r).includes('port_in_use'), 'an unknown variable is reported once, not as a port clash');
});

test('container names, privileged, docker socket, latest tag, restart policy, obsolete version', () => {
  const yaml = `version: "3"
services:
  a:
    image: nginx
    container_name: web
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  b:
    image: redis:7
    container_name: web
    restart: always
`;
  const r = validateStack(yaml, null, { project: 'p', running: [{ name: 'web', project: 'other', ports: [] }] });
  for (const c of ['container_name_duplicate', 'container_name_in_use', 'privileged', 'docker_sock', 'image_latest', 'no_restart', 'version_obsolete']) assert.ok(codes(r).includes(c), `missing ${c}: ${codes(r)}`);
  assert.equal(r.issues[0].level, 'error', 'errors come first');
});

test('stack store: create, save with conflict detection, backups and safety', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-')), data = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const store = new StackStore(root, data);
  const created = await store.create('blog');
  assert.match(created.compose, /services:/); assert.equal(created.env, 'APP_PORT=8080\n');
  assert.equal(fs.statSync(path.join(root, 'blog', '.env')).mode & 0o777, 0o600, '.env is private');
  await assert.rejects(store.create('blog'), { code: 'stack_exists' });
  await assert.rejects(store.create('Bad Name'), { code: 'stack_invalid_name' });
  await assert.rejects(store.read('../etc'), { code: 'stack_invalid_name' });
  await assert.rejects(store.read('nope'), { code: 'stack_not_found' });

  const saved = await store.write('blog', { compose: 'services:\n  app:\n    image: nginx:1\n', composeHash: created.composeHash });
  assert.match(saved.compose, /nginx:1/);
  await assert.rejects(store.write('blog', { compose: 'x', composeHash: created.composeHash }), { code: 'stack_conflict' }, 'stale hash');
  await assert.rejects(store.write('blog', { env: 'A=1', envHash: null }), { code: 'stack_conflict' }, '.env already exists');

  const b = await store.backups('blog');
  assert.equal(b.length, 1); assert.equal(b[0].file, 'compose');
  assert.match(await store.backupContent('blog', b[0].id), /nginx:1-alpine|nginx:1\.27-alpine/);
  await assert.rejects(store.backupContent('blog', '../../etc/passwd'), { code: 'stack_invalid_name' });

  await store.write('blog', { compose: saved.compose, composeHash: saved.composeHash });      // unchanged: no new backup
  assert.equal((await store.backups('blog')).length, 1);
  assert.equal((await store.list()).map(s => s.name).join(), 'blog');
  assert.deepEqual((await store.list())[0].services, ['app']);

  // a symlink that points outside the stacks folder is refused
  fs.mkdirSync(path.join(root, 'evil')); fs.symlinkSync('/etc', path.join(root, 'evil-link'));
  fs.writeFileSync(path.join(root, 'evil', 'compose.yaml'), 'services: {}\n'); fs.symlinkSync('/etc/hostname', path.join(root, 'evil', '.env'));
  await assert.rejects(store.read('evil'), { code: 'stack_invalid_name' });
  await assert.rejects(store.read('evil-link'), { code: 'stack_invalid_name' });
});

test('docker compose runner: streams output, one job per stack, and checks files', async () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'fakebin-'));
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
case "$*" in
  *"compose version"*) echo "Docker Compose version v2.test"; exit 0;;
  *" config "*) input=$(cat); case "$input" in *BROKEN*) echo "services.web.image must be a string" >&2; exit 1;; esac; exit 0;;
  *"down"*) echo "boom" >&2; exit 3;;
  *) echo "ARGS: $*"; sleep 0.3; echo "done"; exit 0;;
esac
`, { mode: 0o755 });
  const oldPath = process.env.PATH; process.env.PATH = `${bin}:${oldPath}`;
  try {
    const msgs: ServerMsg[] = [];
    const jobs = new StackJobs({ hub: { broadcast: (m: ServerMsg) => msgs.push(m) } as unknown as Hub, dockerHost: 'tcp://x:2375', demo: false });
    assert.equal(await jobs.detect(), true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-'));
    const done = (id: string) => new Promise<{ code?: number | null }>(res => { const t = setInterval(() => { const m = msgs.find(x => x.type === 'stack.job' && x.id === id && x.done); if (m) { clearInterval(t); res(m as { code?: number | null }); } }, 20); });

    const id = jobs.start('web', 'up', dir, 'compose.yaml');
    assert.throws(() => jobs.start('web', 'up', dir, 'compose.yaml'), { code: 'job_running' });
    assert.equal((await done(id)).code, 0);
    const output = msgs.filter(m => m.type === 'stack.job' && m.id === id).map(m => (m as { chunk?: string }).chunk ?? '').join('');
    assert.match(output, /--project-name web/); assert.match(output, /up -d --remove-orphans/); assert.match(output, /done/);
    assert.ok(!output.includes(' -v'), 'never deletes volumes');
    assert.equal(jobs.isRunning('web'), false);

    const failing = jobs.start('web', 'down', dir, 'compose.yaml');
    assert.equal((await done(failing)).code, 3);

    assert.deepEqual(await jobs.configCheck(dir, 'services: {}', null), []);
    const bad = await jobs.configCheck(dir, 'BROKEN', 'A=1\n');
    assert.equal(bad[0].code, 'compose_config'); assert.match(String(bad[0].params?.detail), /must be a string/);
  } finally { process.env.PATH = oldPath; }
});
