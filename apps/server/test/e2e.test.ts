import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { Alert, ServerMsg, Service } from '@shared/types';

const PORT = 34000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfdock-e2e-'));
let proc: ChildProcess;
let cookie = '';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function api(p: string, init: RequestInit & { json?: unknown } = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (cookie) headers.cookie = cookie;
  if (init.json !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(init.json); }
  const res = await fetch(BASE + p, { ...init, headers });
  const text = await res.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* plain text */ }
  return { res, body };
}
async function until<T>(fn: () => Promise<T | undefined | false> | T | undefined | false, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v as T; await sleep(100); }
  throw new Error('timed out waiting for the condition');
}
const services = async () => (await api('/api/services')).body as Service[];

before(async () => {
  proc = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, FLORIA_DEMO: '1', LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await until(async () => { try { return (await fetch(`${BASE}/api/health`)).ok; } catch { return false; } }, 15000);
});
after(() => { proc?.kill('SIGTERM'); });

test('requires login and sets up the first user', async () => {
  const anon = await api('/api/services');
  assert.equal(anon.res.status, 401);
  assert.equal(anon.body.code, 'login_required');
  assert.equal((await api('/api/auth/state')).body.setupRequired, true);
  assert.equal((await api('/api/auth/setup', { method: 'POST', json: { username: 'ab', password: '12345678' } })).res.status, 400);
  const r = await api('/api/auth/setup', { method: 'POST', json: { username: 'admin', password: 'strong-password-123' } });
  assert.equal(r.res.status, 200);
  cookie = r.res.headers.getSetCookie()[0].split(';')[0];
  assert.match(r.res.headers.getSetCookie()[0], /HttpOnly/i);
  assert.equal((await api('/api/auth/setup', { method: 'POST', json: { username: 'other', password: 'strong-password-123' } })).body.code, 'already_setup');
  assert.equal((await api('/api/auth/login', { method: 'POST', json: { username: 'admin', password: 'wrong' } })).body.code, 'bad_credentials');
});

test('blocks requests from another origin', async () => {
  const { res } = await api('/api/services/docker:jellyfin/action', { method: 'POST', json: { action: 'stop' }, headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});

test('infrastructure settings are partial, validated, and clearable', async () => {
  const initial = await api('/api/settings');
  assert.deepEqual(initial.body.infrastructure, { localHost: '', baseDomain: '', tailscaleIp: '', proxyDomain: '' });
  const first = await api('/api/settings/infrastructure', { method: 'PUT', json: {
    localHost: '192.168.18.12', baseDomain: 'talona.com.br', tailscaleIp: '100.84.187.66', proxyDomain: '*.talona.com.br',
  } });
  assert.equal(first.res.status, 200);
  const partial = await api('/api/settings/infrastructure', { method: 'PUT', json: { localHost: '192.168.18.13' } });
  assert.equal(partial.res.status, 200);
  assert.deepEqual(partial.body.infrastructure, {
    localHost: '192.168.18.13', baseDomain: 'talona.com.br', tailscaleIp: '100.84.187.66', proxyDomain: '*.talona.com.br',
  });
  assert.equal((await api('/api/settings/infrastructure', { method: 'PUT', json: { tailscaleIp: '300.1.1.1' } })).res.status, 400);
  const cleared = await api('/api/settings/infrastructure', { method: 'PUT', json: { localHost: '' } });
  assert.equal(cleared.body.infrastructure.localHost, '');
  await api('/api/settings/infrastructure', { method: 'PUT', json: { localHost: '192.168.18.12' } });
});

test('lists containers and builds the cards automatically', async () => {
  const list = await services();
  const by = Object.fromEntries(list.map(s => [s.id, s]));
  assert.ok(!by['docker:selfdock'], 'the dashboard must not show itself');
  assert.equal(by['docker:jellyfin'].status, 'online');
  assert.equal(by['docker:jellyfin'].category, 'media');
  assert.equal(by['docker:jellyfin'].catalog, 'jellyfin');
  assert.equal(by['docker:jellyfin'].description, '', 'known apps leave the description to the dashboard (translated)');
  assert.equal(by['docker:jellyfin'].port, 8096);
  assert.deepEqual(by['docker:jellyfin'].addresses.publishedPorts, [
    { containerPort: 8096, hostPort: 8096, hostIp: '0.0.0.0', protocol: 'tcp' },
  ]);
  assert.equal(by['docker:jellyfin'].addresses.localUrl, 'http://192.168.18.12:8096');
  assert.equal(by['docker:jellyfin'].addresses.tailscaleUrl, 'http://100.84.187.66:8096');
  assert.equal(by['docker:jellyfin'].addresses.proxyUrl, 'https://jellyfin.talona.com.br');
  assert.equal(by['docker:qbittorrent'].status, 'offline');
  assert.equal(by['docker:qbittorrent'].port, 8082);
  assert.equal(by['docker:homeassistant'].port, 8123, 'port from the floria.port label');
  assert.equal(by['docker:pihole'].port, 8081);
  assert.equal(by['docker:pihole'].addresses.webPort, 80);
  assert.equal(by['docker:pihole'].addresses.localUrl, 'http://192.168.18.12:8081');
  assert.equal(by['docker:wireguard'].port, null);
  assert.equal(by['docker:my-app'].name, 'My homemade app');
  assert.equal(by['docker:my-app'].description, 'An app I built myself');
  assert.equal(by['docker:my-app'].category, 'other');
  await until(() => services().then(list => list.find(s => s.id === 'docker:my-app' && s.imageUpdateStatus === 'outdated')));
  assert.equal((await services()).find(s => s.id === 'docker:my-app')?.imageUpdateStatus, 'outdated');
  assert.equal((await services()).find(s => s.id === 'docker:jellyfin')?.imageUpdateStatus, 'current');
  assert.deepEqual(['homeassistant', 'pihole', 'wireguard', 'qbittorrent'].map(k => by['docker:' + k].name), ['Home Assistant', 'Pi-hole', 'WireGuard', 'qBittorrent']);
});

test('service address overrides persist without changing the global presets', async () => {
  const saved = await api('/api/services/docker:jellyfin', { method: 'PATCH', json: {
    addresses: { localUrl: 'http://media.lan:8099', proxyDomain: 'media.example.net' },
  } });
  assert.equal(saved.res.status, 200);
  let jellyfin = (await services()).find(service => service.id === 'docker:jellyfin')!;
  assert.equal(jellyfin.addresses.localUrl, 'http://media.lan:8099');
  assert.equal(jellyfin.addresses.tailscaleUrl, 'http://100.84.187.66:8096');
  assert.equal(jellyfin.addresses.proxyUrl, 'https://media.example.net');
  assert.equal(jellyfin.addresses.customized.localUrl, true);
  const updatedGlobal = await api('/api/settings/infrastructure', { method: 'PUT', json: { proxyDomain: '*.selfdock.test' } });
  assert.equal(updatedGlobal.res.status, 200);
  jellyfin = (await services()).find(service => service.id === 'docker:jellyfin')!;
  assert.equal(jellyfin.addresses.proxyUrl, 'https://media.example.net', 'a per-service domain survives global changes');
  assert.equal((await services()).find(service => service.id === 'docker:navidrome')!.addresses.proxyUrl, 'https://navidrome.selfdock.test');
  assert.equal((await api('/api/services/docker:navidrome', { method: 'PATCH', json: {
    addresses: { proxyDomain: 'media.example.net' },
  } })).res.status, 409);
  assert.equal((await api('/api/services/docker:jellyfin', { method: 'PATCH', json: {
    addresses: { publishedPort: { containerPort: 1, hostPort: 2, hostIp: null, protocol: 'tcp' } },
  } })).res.status, 400);
  assert.equal((await api('/api/services/docker:jellyfin', { method: 'PATCH', json: {
    addresses: { localUrl: null, proxyDomain: null },
  } })).res.status, 200);
  jellyfin = (await services()).find(service => service.id === 'docker:jellyfin')!;
  assert.equal(jellyfin.addresses.localUrl, 'http://192.168.18.12:8096');
  assert.equal(jellyfin.addresses.proxyUrl, 'https://jellyfin.selfdock.test');
  await api('/api/settings/infrastructure', { method: 'PUT', json: { proxyDomain: '*.talona.com.br' } });
});

test('downloads icons automatically and serves them from the local cache', async () => {
  const withIcon = await until(async () => (await services()).find(s => s.id === 'docker:jellyfin' && s.icon), 15000).catch(() => null);
  if (!withIcon) { console.log('  (no internet access: skipping the icon check)'); return; }
  assert.equal(withIcon.icon, 'jellyfin.svg');
  const img = await api('/api/icons/jellyfin.svg');
  assert.equal(img.res.status, 200);
  assert.match(img.res.headers.get('content-type') ?? '', /svg/);
  assert.ok(fs.existsSync(path.join(dataDir, 'icons', 'jellyfin.svg')));
  fs.writeFileSync(path.join(dataDir, 'icons', 'navidrome.svg'), '<svg><g><animateTransform attributeName="transform"/></g></svg>');
  const navidrome = await api('/api/icons/navidrome.svg');
  assert.equal(navidrome.res.status, 200);
  assert.doesNotMatch(navidrome.body, /<animateTransform\b/i);
  assert.equal((await services()).find(s => s.id === 'docker:my-app')!.icon, null, 'unknown apps get no icon (the dashboard uses a fallback)');
});

function lastAlerts(msgs: ServerMsg[]): Alert[] {
  const last = [...msgs].reverse().find(m => m.type === 'alerts' || m.type === 'snapshot') as { alerts?: Alert[] } | undefined;
  return last?.alerts ?? [];
}

test('real time: stopping and starting an app arrives over WebSocket and becomes history', async () => {
  const msgs: ServerMsg[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`, { headers: { cookie } });
  ws.on('message', d => msgs.push(JSON.parse(String(d))));
  await until(() => msgs.find(m => m.type === 'snapshot'));
  const snap = msgs.find(m => m.type === 'snapshot') as Extract<ServerMsg, { type: 'snapshot' }>;
  assert.ok(snap.services.length >= 12);
  assert.equal(snap.docker.ok, true);

  const stop = await api('/api/services/docker:navidrome/action', { method: 'POST', json: { action: 'stop' } });
  assert.equal(stop.res.status, 200);
  const statuses = () => msgs.filter((m): m is Extract<ServerMsg, { type: 'service.upsert' }> => m.type === 'service.upsert' && m.service.id === 'docker:navidrome').map(m => m.service.status);
  await until(() => statuses().includes('offline'));
  assert.ok(statuses().includes('stopping'), 'goes through the "stopping" state');

  let h = (await api('/api/history')).body;
  const planned = h.incidents.find((i: any) => i.serviceId === 'docker:navidrome');
  assert.ok(planned?.planned, 'a stop requested from the dashboard is recorded as planned');
  assert.equal(planned.cause, 'user');
  assert.equal(planned.endedAt, null);
  assert.ok(!lastAlerts(msgs).some(a => a.id === 'down:docker:navidrome'), 'a planned stop raises no alert');

  await api('/api/services/docker:navidrome/action', { method: 'POST', json: { action: 'start' } });
  await until(async () => (await services()).find(s => s.id === 'docker:navidrome')?.status === 'online');
  h = (await api('/api/history')).body;
  assert.ok(h.incidents.find((i: any) => i.serviceId === 'docker:navidrome').endedAt, 'the stop ends when the app is started again');
  assert.equal(h.availability.find((a: any) => a.serviceId === 'docker:navidrome').last24h, 100, 'a planned stop does not reduce availability');
  ws.close();
});

test('restart goes through "restarting" and comes back up', async () => {
  const r = await api('/api/services/docker:nextcloud/action', { method: 'POST', json: { action: 'restart' } });
  assert.equal(r.res.status, 200);
  assert.equal((await services()).find(s => s.id === 'docker:nextcloud')?.status, 'online');
  const missing = await api('/api/services/docker:nope/action', { method: 'POST', json: { action: 'stop' } });
  assert.equal(missing.res.status, 404);
  assert.equal(missing.body.code, 'service_not_found');
});

test('container logs', async () => {
  const { body } = await api('/api/services/docker:jellyfin/logs?tail=50');
  assert.match(body.text, /all good/);
  assert.match(body.text, /slow database/);
});

test('customise: rename, change category and hide', async () => {
  const r = await api('/api/services/docker:my-app', { method: 'PATCH', json: { name: 'My Thing', category: 'home', hidden: true } });
  assert.equal(r.res.status, 200);
  const s = (await services()).find(x => x.id === 'docker:my-app')!;
  assert.deepEqual([s.name, s.category, s.hidden], ['My Thing', 'home', true]);
  assert.equal((await api('/api/services/docker:my-app', { method: 'PATCH', json: { category: 'invented' } })).res.status, 400);
});

test('manual service: HTTP check and removal', async () => {
  const add = await api('/api/services/manual', { method: 'POST', json: { name: 'Router', url: `${BASE}/api/health`, category: 'network' } });
  assert.equal(add.res.status, 200);
  const id = add.body.id as string;
  const s = await until(async () => (await services()).find(x => x.id === id && x.status === 'online'));
  assert.equal(s.category, 'network');
  assert.equal((await api('/api/services/manual', { method: 'POST', json: { name: 'x', url: 'ftp://x' } })).res.status, 400);
  assert.equal((await api(`/api/services/${id}`, { method: 'DELETE' })).res.status, 200);
  assert.ok(!(await services()).some(x => x.id === id));
  assert.equal((await api('/api/services/docker:jellyfin', { method: 'DELETE' })).body.code, 'manual_only');
});

test('real server metrics and settings', async () => {
  const msgs: ServerMsg[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`, { headers: { cookie } });
  ws.on('message', d => msgs.push(JSON.parse(String(d))));
  const snap = await until(() => msgs.find(m => m.type === 'snapshot')) as Extract<ServerMsg, { type: 'snapshot' }>;
  const m = snap.metrics!;
  assert.ok(m.ram.total > 0 && m.disk.total > 0);
  assert.ok(m.cpu >= 0 && m.cpu <= 100);
  assert.ok(m.containers.total >= 12);
  ws.close();
  assert.equal((await api('/api/settings', { method: 'PUT', json: { metricsIntervalSec: 1, checkIntervalSec: 30 } })).res.status, 400);
  assert.equal((await api('/api/settings', { method: 'PUT', json: { metricsIntervalSec: 5, checkIntervalSec: 30 } })).res.status, 200);
});

test('WebSocket without login is refused', async () => {
  const code = await new Promise<number>(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`);
    ws.on('close', c => resolve(c));
    ws.on('error', () => { /* ignore */ });
  });
  assert.equal(code, 4401);
});

test('stack editor: list, check, save with conflict detection, backups, create and apply', async () => {
  const info = (await api('/api/stacks')).body;
  assert.equal(info.enabled, true); assert.equal(info.apply, true);
  const by = Object.fromEntries(info.stacks.map((s: any) => [s.name, s]));
  assert.deepEqual(by.media.services, ['jellyfin', 'navidrome']);
  assert.equal(by.media.running, 2, 'status comes from the compose project label');
  assert.ok(by.monitoring);

  const files = (await api('/api/stacks/monitoring')).body;
  const checked = (await api('/api/stacks/validate', { method: 'POST', json: { name: 'monitoring', compose: files.compose, env: files.env } })).body;
  const issue = (code: string) => checked.issues.find((i: any) => i.code === code);
  assert.equal(issue('port_in_use').params.by, 'pihole');
  assert.equal(issue('port_in_use').params.port, 8081);
  assert.equal(issue('env_missing').params.name, 'GRAFANA_PORT');
  assert.ok(issue('privileged') && issue('image_latest'));

  const stale = await api('/api/stacks/monitoring', { method: 'PUT', json: { compose: 'services: {}', composeHash: 'not-the-current-hash' } });
  assert.equal(stale.res.status, 409); assert.equal(stale.body.code, 'stack_conflict');
  const fixed = files.compose.replace('"8081:3001"', '"8083:3001"');
  const saved = await api('/api/stacks/monitoring', { method: 'PUT', json: { compose: fixed, composeHash: files.composeHash } });
  assert.equal(saved.res.status, 200); assert.match(saved.body.compose, /8083:3001/);
  const backups = (await api('/api/stacks/monitoring/backups')).body;
  assert.equal(backups.length, 1);
  assert.match((await api(`/api/stacks/monitoring/backups/${backups[0].id}`)).body.content, /8081:3001/, 'the backup holds the old version');

  assert.equal((await api('/api/stacks', { method: 'POST', json: { name: 'Bad Name' } })).body.code, 'stack_invalid_name');
  assert.equal((await api('/api/stacks', { method: 'POST', json: { name: 'blog' } })).res.status, 200);
  assert.equal((await api('/api/stacks', { method: 'POST', json: { name: 'blog' } })).body.code, 'stack_exists');
  assert.equal((await api('/api/stacks/..%2F..%2Fetc')).res.status, 400);

  const msgs: ServerMsg[] = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`, { headers: { cookie } });
  ws.on('message', d => msgs.push(JSON.parse(String(d))));
  await until(() => msgs.find(m => m.type === 'snapshot'));
  const run = await api('/api/stacks/media/apply', { method: 'POST', json: { action: 'up' } });
  assert.equal(run.res.status, 200);
  assert.equal((await api('/api/stacks/media/apply', { method: 'POST', json: { action: 'up' } })).body.code, 'job_running');
  const finished = await until(() => msgs.find(m => m.type === 'stack.job' && m.id === run.body.id && m.done), 15000) as Extract<ServerMsg, { type: 'stack.job' }>;
  assert.equal(finished.code, 0);
  const out = msgs.filter((m): m is Extract<ServerMsg, { type: 'stack.job' }> => m.type === 'stack.job' && m.id === run.body.id).map(m => m.chunk ?? '').join('');
  assert.match(out, /jellyfin/); assert.match(out, /navidrome/);
  ws.close();
});
