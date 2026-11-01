import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPassword, verifyPassword } from '../src/auth';
import { displayNameFor, iconCandidates, knownFor, prettifyName } from '../src/catalog';
import { DockerClient, demuxDockerLogs, parseDockerHost } from '../src/docker';
import { deathCause, dockerState, mapStatus, pickPort } from '../src/registry';
import { computeAvailability } from '../src/history';
import { openDb } from '../src/db';
import { addressOverridesSchema, buildServiceAddresses, infrastructureSchema, publishedPorts, slugifyServiceName, uniqueSubdomain } from '../src/service-addresses';
import { classifyUpdate, parseSemVer } from '../src/semver';
import { RegistryChecker } from '../src/registry-checker';

test('password: hash verifies and rejects a wrong password', () => {
  const h = hashPassword('a-long-password');
  assert.ok(verifyPassword('a-long-password', h));
  assert.ok(!verifyPassword('another-one', h));
  assert.ok(!verifyPassword('x', 'garbage'));
});

test('semantic versions parse and classify image updates', () => {
  assert.deepEqual(parseSemVer('v1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: undefined });
  assert.deepEqual(parseSemVer('2.4.0-rc.1+build.7'), { major: 2, minor: 4, patch: 0, prerelease: 'rc.1' });
  assert.equal(parseSemVer('latest'), null);
  assert.equal(parseSemVer('1.2'), null);

  assert.equal(classifyUpdate('1.2.3', '1.2.4'), 'patch');
  assert.equal(classifyUpdate('1.2.3', '1.3.0'), 'minor');
  assert.equal(classifyUpdate('1.2.3', '2.0.0'), 'major');
  assert.equal(classifyUpdate('1.2.3', '1.2.3'), 'current');
  assert.equal(classifyUpdate('latest', 'latest', 'sha-old', 'sha-new'), 'floating');
  assert.equal(classifyUpdate('ghcr.io/app@sha256:abc', 'latest', 'sha-old', 'sha-new'), 'current');
  assert.equal(classifyUpdate('custom-tag', 'another-tag'), 'uncomparable');
  assert.equal(classifyUpdate('custom-tag', 'another-tag', 'sha-old', 'sha-new'), 'unknown');
});

test('registry checker coalesces concurrent checks and caches results', async () => {
  let calls = 0;
  let resolveCheck!: (status: 'current' | 'outdated') => void;
  const docker = {
    imageUpdateStatus: () => {
      calls += 1;
      return new Promise<'current' | 'outdated'>(resolve => { resolveCheck = resolve; });
    },
  };
  const checker = new RegistryChecker(docker);
  const first = checker.checkImage('ghcr.io/example/app:1.0', 'sha-local');
  const second = checker.checkImage('ghcr.io/example/app:1.0', 'sha-local');
  assert.equal(calls, 1, 'concurrent requests share one registry check');
  resolveCheck('outdated');
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 'patch');
  assert.equal(b, a);
  assert.equal((await checker.checkImage('ghcr.io/example/app:1.0')).status, 'patch');
  assert.equal(calls, 1, 'a successful result is cached');
});

test('registry checker reports and caches registry errors', async () => {
  let calls = 0;
  const checker = new RegistryChecker({
    imageUpdateStatus: async () => { calls += 1; throw new Error('registry unavailable'); },
  });
  const result = await checker.checkImage('ghcr.io/example/private:1.0');
  assert.equal(result.status, 'error');
  assert.equal(calls, 1);
  assert.equal(await checker.checkImage('ghcr.io/example/private:1.0'), result);
  assert.equal(calls, 1, 'an error result is cached to avoid repeated registry requests');
});

test('registry checker skips registry calls for digest-pinned images', async () => {
  let calls = 0;
  const checker = new RegistryChecker({
    imageUpdateStatus: async () => { calls += 1; return 'outdated'; },
  });
  const result = await checker.checkImage('ghcr.io/example/app@sha256:abc', 'sha-local');
  assert.equal(result.status, 'digest');
  assert.equal(result.currentDigest, 'sha-local');
  assert.equal(calls, 0);
});

test('icons: candidates come from the container image', () => {
  assert.equal(iconCandidates({ image: 'jellyfin/jellyfin:10.10.3', name: 'jellyfin' })[0], 'jellyfin');
  assert.equal(iconCandidates({ image: 'ghcr.io/immich-app/immich-server:release' })[0], 'immich');
  assert.equal(iconCandidates({ image: 'vaultwarden/server:latest' })[0], 'vaultwarden');
  assert.equal(iconCandidates({ image: 'pihole/pihole' })[0], 'pi-hole');
  assert.equal(iconCandidates({ image: 'lscr.io/linuxserver/qbittorrent:latest' })[0], 'qbittorrent');
  assert.equal(iconCandidates({ label: 'My Icon', image: 'x/y' })[0], 'my-icon');
  assert.deepEqual(knownFor(iconCandidates({ image: 'nextcloud:29' })), { key: 'nextcloud', category: 'files' });
  assert.deepEqual(knownFor(iconCandidates({ image: 'linuxserver/sonarr:latest' })), { key: 'sonarr', category: 'arr' });
  assert.equal(prettifyName('uptime-kuma'), 'Uptime Kuma');
  assert.equal(displayNameFor(['pi-hole']), 'Pi-hole');
});

test('docker: DOCKER_HOST parsing and multiplexed logs', async () => {
  assert.deepEqual(parseDockerHost('unix:///var/run/docker.sock'), { socketPath: '/var/run/docker.sock' });
  assert.deepEqual(parseDockerHost('tcp://docker-proxy:2375'), { host: 'docker-proxy', port: 2375 });
  assert.throws(() => parseDockerHost('banana'));
  const body = Buffer.from('hello\n');
  const head = Buffer.alloc(8); head[0] = 1; head.writeUInt32BE(body.length, 4);
  assert.equal(demuxDockerLogs(Buffer.concat([head, body, head, body])), 'hello\nhello\n');
  assert.equal(demuxDockerLogs(Buffer.from('plain TTY text')), 'plain TTY text');
  assert.equal(demuxDockerLogs(Buffer.concat([head, body, head, body.subarray(0, 2)])), Buffer.concat([head, body, head, body.subarray(0, 2)]).toString('utf8'));
  const aborted = new AbortController();
  aborted.abort();
  await assert.doesNotReject(() => new DockerClient('tcp://127.0.0.1:1').events(() => {}, aborted.signal, () => {}));
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

test('service addresses validate infrastructure and preserve Docker port mappings', () => {
  const infrastructure = {
    localHost: '192.168.18.12',
    baseDomain: 'talona.com.br',
    tailscaleIp: '100.84.187.66',
    proxyDomain: '*.talona.com.br',
  };
  assert.equal(infrastructureSchema.safeParse(infrastructure).success, true);
  assert.equal(infrastructureSchema.safeParse({ ...infrastructure, tailscaleIp: '1000.1.1.1' }).success, false);
  assert.equal(infrastructureSchema.safeParse({ ...infrastructure, localHost: 'https://server.example' }).success, false);
  assert.equal(addressOverridesSchema.safeParse({ localUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(addressOverridesSchema.safeParse({ subdomain: 'not a domain' }).success, false);

  const mappings = publishedPorts([
    { PrivatePort: 80, PublicPort: 8080, IP: '0.0.0.0', Type: 'tcp' },
    { PrivatePort: 443, PublicPort: 8443, IP: '0.0.0.0', Type: 'tcp' },
    { PrivatePort: 53, PublicPort: 5353, Type: 'udp' },
    { PrivatePort: 8080, Type: 'tcp' },
  ]);
  const generated = buildServiceAddresses({ name: 'AdGuard Home', infrastructure, publishedPorts: mappings });
  assert.equal(slugifyServiceName('AdGuard Home'), 'adguard');
  assert.equal(generated.webPort, 80);
  assert.equal(generated.webPortSource, 'inferred');
  assert.deepEqual(generated.publishedPort, mappings[0]);
  assert.equal(generated.localUrl, 'http://192.168.18.12:8080');
  assert.equal(generated.tailscaleUrl, 'http://100.84.187.66:8080');
  assert.equal(generated.proxyUrl, 'https://adguard.talona.com.br');
  assert.deepEqual(generated.publishedPorts, mappings);
  assert.equal(uniqueSubdomain('AdGuard Home', ['adguard']), 'adguard-2');

  const noGlobals = { localHost: '', baseDomain: '', tailscaleIp: '', proxyDomain: '' };
  const unresolved = buildServiceAddresses({
    name: 'Unknown app',
    infrastructure: noGlobals,
    publishedPorts: [{ containerPort: 9000, hostPort: 19000, hostIp: '0.0.0.0', protocol: 'tcp' }],
  });
  assert.equal(unresolved.webPort, null, 'a published port alone does not identify a web interface');
  assert.equal(unresolved.webPortSource, null);
  assert.equal(unresolved.localUrl, null);
  assert.equal(unresolved.proxyUrl, null);

  const customized = buildServiceAddresses({
    name: 'AdGuard Home',
    infrastructure,
    publishedPorts: mappings,
    overrides: { webPort: 443, localUrl: 'http://adguard.lan:4444', proxyDomain: 'dns.example.net', subdomain: 'dns' },
  });
  assert.equal(customized.webPort, 443);
  assert.equal(customized.webPortSource, 'override');
  assert.equal(customized.publishedPort, mappings[1]);
  assert.equal(customized.localUrl, 'http://adguard.lan:4444');
  assert.equal(customized.proxyUrl, 'https://dns.example.net');
  assert.equal(customized.presets.localUrl, 'http://192.168.18.12:8443');
  assert.equal(customized.subdomain, 'dns');

  const duplicate = buildServiceAddresses({
    name: 'AdGuard Home',
    infrastructure,
    publishedPorts: mappings,
    usedSubdomains: ['adguard'],
  });
  assert.equal(duplicate.subdomain, 'adguard-2');

  const ambiguousMappings = [
    { containerPort: 80, hostPort: 8080, hostIp: '0.0.0.0', protocol: 'tcp' },
    { containerPort: 80, hostPort: 8081, hostIp: '0.0.0.0', protocol: 'tcp' },
  ];
  const ambiguous = buildServiceAddresses({ name: 'AdGuard Home', infrastructure, publishedPorts: ambiguousMappings });
  assert.equal(ambiguous.webPort, 80);
  assert.equal(ambiguous.publishedPort, null);
  assert.equal(ambiguous.localUrl, null, 'multiple host mappings require the user to select one');
  const selected = buildServiceAddresses({
    name: 'AdGuard Home',
    infrastructure,
    publishedPorts: ambiguousMappings,
    overrides: { publishedPort: ambiguousMappings[1] },
  });
  assert.equal(selected.localUrl, 'http://192.168.18.12:8081');
  const loopback = buildServiceAddresses({
    name: 'AdGuard Home',
    infrastructure,
    publishedPorts: [{ containerPort: 80, hostPort: 8080, hostIp: '127.0.0.1', protocol: 'tcp' }],
  });
  assert.equal(loopback.localUrl, null, 'a loopback-only binding must not produce a LAN address');
  const localOnly = buildServiceAddresses({
    name: 'AdGuard Home',
    infrastructure,
    publishedPorts: [{ containerPort: 80, hostPort: 8080, hostIp: '192.168.18.12', protocol: 'tcp' }],
  });
  assert.equal(localOnly.localUrl, 'http://192.168.18.12:8080');
  assert.equal(localOnly.tailscaleUrl, null, 'a LAN-only binding must not produce a Tailscale address');

  const hostNetwork = buildServiceAddresses({
    name: 'Home Assistant',
    infrastructure,
    publishedPorts: [],
    legacyPort: '8123',
  });
  assert.equal(hostNetwork.webPortSource, 'label');
  assert.equal(hostNetwork.localUrl, 'http://192.168.18.12:8123');
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
  assert.equal(av.downtime24hMs, H);
  assert.equal(av.downtime7dMs, H);
  ins.run('docker:b', 'B', 'offline', 0, now - 30 * 60_000, null);
  const [open] = computeAvailability(db, [{ id: 'docker:b', name: 'B' } as never], now - 24 * H, now);
  assert.equal(open.downtime24hMs, 30 * 60_000);
  db.close();
});
