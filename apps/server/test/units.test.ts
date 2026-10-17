import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword, verifyPassword } from '../src/auth';
import { displayNameFor, iconCandidates, knownFor, prettifyName } from '../src/catalog';
import { demuxDockerLogs, parseDockerHost } from '../src/docker';
import { deathCause, dockerState, mapStatus, pickPort } from '../src/registry';
import { computeAvailability } from '../src/history';
import { openDb } from '../src/db';

test('password: hash verifies and rejects a wrong password', () => {
  const h = hashPassword('a-long-password');
  assert.ok(verifyPassword('a-long-password', h));
  assert.ok(!verifyPassword('another-one', h));
  assert.ok(!verifyPassword('x', 'garbage'));
});

test('icons: candidates come from the container image', () => {
  assert.equal(iconCandidates({ image: 'jellyfin/jellyfin:10.10.3', name: 'jellyfin' })[0], 'jellyfin');
  assert.equal(iconCandidates({ image: 'ghcr.io/immich-app/immich-server:release' })[0], 'immich');
  assert.equal(iconCandidates({ image: 'vaultwarden/server:latest' })[0], 'vaultwarden');
  assert.equal(iconCandidates({ image: 'pihole/pihole' })[0], 'pi-hole');
  assert.equal(iconCandidates({ image: 'lscr.io/linuxserver/qbittorrent:latest' })[0], 'qbittorrent');
  assert.equal(iconCandidates({ label: 'My Icon', image: 'x/y' })[0], 'my-icon');
  assert.deepEqual(knownFor(iconCandidates({ image: 'nextcloud:29' })), { key: 'nextcloud', category: 'files' });
  assert.equal(prettifyName('uptime-kuma'), 'Uptime Kuma');
  assert.equal(displayNameFor(['pi-hole']), 'Pi-hole');
});

test('docker: DOCKER_HOST parsing and multiplexed logs', () => {
  assert.deepEqual(parseDockerHost('unix:///var/run/docker.sock'), { socketPath: '/var/run/docker.sock' });
  assert.deepEqual(parseDockerHost('tcp://docker-proxy:2375'), { host: 'docker-proxy', port: 2375 });
  assert.throws(() => parseDockerHost('banana'));
  const body = Buffer.from('hello\n');
  const head = Buffer.alloc(8); head[0] = 1; head.writeUInt32BE(body.length, 4);
  assert.equal(demuxDockerLogs(Buffer.concat([head, body, head, body])), 'hello\nhello\n');
  assert.equal(demuxDockerLogs(Buffer.from('plain TTY text')), 'plain TTY text');
});

test('status and port from a container', () => {
  assert.equal(mapStatus('running', 'Up 2 hours'), 'online');
  assert.equal(mapStatus('running', 'Up 2 hours (unhealthy)'), 'unhealthy');
  assert.equal(mapStatus('running', 'Up 5 seconds (health: starting)'), 'starting');
  assert.equal(mapStatus('exited', 'Exited (1) 1 hour ago'), 'offline');
  assert.equal(mapStatus('restarting', 'Restarting'), 'restarting');
  const c = { Id: 'a', Names: ['/x'], Image: 'x', Labels: {}, State: 'running', Status: '', Created: 0,
    Ports: [{ PrivatePort: 53, PublicPort: 53, Type: 'tcp' }, { PrivatePort: 80, PublicPort: 8081, Type: 'tcp' }, { PrivatePort: 51820, PublicPort: 51820, Type: 'udp' }] };
  assert.equal(pickPort(c), 8081);
  assert.equal(pickPort({ ...c, Ports: [], Labels: { 'floria.port': '8123' } }), 8123);
  assert.equal(pickPort({ ...c, Ports: [] }), null);
});

test('cause codes for a downtime', () => {
  const now = Date.now();
  assert.equal(deathCause({ exitCode: 137, oom: true, at: now }), 'oom');
  assert.equal(deathCause({ exitCode: 137, oom: false, at: now }), 'killed');
  assert.equal(deathCause({ exitCode: 143, oom: false, at: now }), 'sigterm');
  assert.equal(deathCause({ exitCode: 0, oom: false, at: now }), 'exit0');
  assert.equal(deathCause({ exitCode: 1, oom: false, at: now }), 'exit:1');
  assert.equal(deathCause({ exitCode: 1, oom: false, at: now - 3600_000 }), null);
});

test('docker errors become neutral codes', () => {
  assert.deepEqual(dockerState(Object.assign(new Error('x'), { code: 'ENOENT' })), { ok: false, code: 'socket_not_found' });
  assert.deepEqual(dockerState(Object.assign(new Error('x'), { code: 'EACCES' })), { ok: false, code: 'permission_denied' });
  assert.equal(dockerState(new Error('boom')).detail, 'boom');
});

test('availability ignores stops the user asked for', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfdock-'));
  const db = openDb(dir);
  const now = Date.now(), H = 3600_000;
  const ins = db.prepare('INSERT INTO incidents(service_key, service_name, kind, planned, started_at, ended_at) VALUES(?,?,?,?,?,?)');
  ins.run('docker:a', 'A', 'offline', 0, now - 2 * H, now - 1 * H);   // 1 h of real downtime
  ins.run('docker:a', 'A', 'offline', 1, now - 5 * H, now - 4 * H);   // planned stop: does not count
  const svc = { id: 'docker:a', name: 'A' } as never;
  const [av] = computeAvailability(db, [svc], now - 24 * H, now);
  assert.equal(av.last24h, Math.round((100 - (1 / 24) * 100) * 100) / 100);
  assert.equal(av.incidents7d, 1);
  db.close();
});
