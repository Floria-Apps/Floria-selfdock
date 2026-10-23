/**
 * A fake Docker for demo mode (FLORIA_DEMO=1) and for tests.
 * It speaks the same HTTP protocol as the Docker Engine: lists containers, emits events and accepts start/stop/restart.
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';

type State = 'running' | 'exited' | 'restarting';
interface Mock {
  id: string; name: string; image: string; labels: Record<string, string>;
  ports: { priv: number; pub: number; type?: string }[];
  state: State; health?: 'healthy' | 'unhealthy'; since: number;
}

const mk = (name: string, image: string, ports: [number, number][], extra: Partial<Mock> = {}): Mock => ({
  id: createHash('sha256').update(name).digest('hex'),
  name, image, labels: {}, ports: ports.map(([priv, pub]) => ({ priv, pub })), state: 'running', since: Date.now() - 3 * 3600_000, ...extra,
});
const imageDigest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export function seedContainers(): Mock[] {
  return [
    mk('jellyfin', 'jellyfin/jellyfin:10.10.3', [[8096, 8096]], { labels: { 'com.docker.compose.project': 'media', 'com.docker.compose.service': 'jellyfin' } }),
    mk('immich_server', 'ghcr.io/immich-app/immich-server:release', [[2283, 2283]], { labels: { 'com.docker.compose.service': 'immich-server' } }),
    mk('navidrome', 'deluan/navidrome:latest', [[4533, 4533]], { labels: { 'com.docker.compose.project': 'media', 'com.docker.compose.service': 'navidrome' } }),
    mk('homeassistant', 'ghcr.io/home-assistant/home-assistant:stable', [], { labels: { 'floria.port': '8123' } }),
    mk('frigate', 'ghcr.io/blakeblackshear/frigate:stable', [[5000, 5000]]),
    mk('pihole', 'pihole/pihole:latest', [[80, 8081], [53, 53]]),
    mk('wireguard', 'lscr.io/linuxserver/wireguard:latest', []),
    mk('uptime-kuma', 'louislam/uptime-kuma:1', [[3001, 3001]]),
    mk('nextcloud', 'nextcloud:29', [[80, 8080]]),
    mk('paperless', 'ghcr.io/paperless-ngx/paperless-ngx:latest', [[8000, 8000]]),
    mk('qbittorrent', 'lscr.io/linuxserver/qbittorrent:latest', [[8080, 8082]], { state: 'exited', since: Date.now() - 2 * 3600_000 }),
    mk('vaultwarden', 'vaultwarden/server:latest', [[80, 8222]], { health: 'healthy' }),
    mk('my-app', 'myorg/cool-app:1.4', [[9100, 9100]], { labels: { 'floria.name': 'My homemade app', 'floria.description': 'An app I built myself' } }),
    mk('selfdock', 'ghcr.io/floriaapps/floria-selfdock:latest', [[3000, 3000]], { labels: { 'floria.hide': 'true' } }),
  ];
}

export async function startMockDocker(opts: { crashes?: boolean } = {}) {
  const containers = seedContainers();
  const streams = new Set<http.ServerResponse>();
  const timers = new Set<NodeJS.Timeout>();
  const find = (ref: string) => containers.find(c => c.id === ref || c.name === ref || c.id.startsWith(ref));
  const sleep = (ms: number) => new Promise<void>(r => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });

  const emit = (action: string, c: Mock, attrs: Record<string, string> = {}) => {
    const line = JSON.stringify({
      Type: 'container', Action: action,
      Actor: { ID: c.id, Attributes: { name: c.name, image: c.image, ...attrs } },
      time: Math.floor(Date.now() / 1000),
    }) + '\n';
    for (const s of streams) s.write(line);
  };

  const statusText = (c: Mock) => {
    if (c.state === 'exited') return 'Exited (0) 2 hours ago';
    if (c.state === 'restarting') return 'Restarting (1) 3 seconds ago';
    return `Up 3 hours${c.health ? ` (${c.health})` : ''}`;
  };
  const toApi = (c: Mock) => ({
    Id: c.id, Names: [`/${c.name}`], Image: c.image, Labels: c.labels, State: c.state, Status: statusText(c), Created: Math.floor(c.since / 1000),
    Ports: c.ports.map(p => ({ IP: '0.0.0.0', PrivatePort: p.priv, PublicPort: p.pub, Type: p.type ?? 'tcp' })),
  });

  const stop = async (c: Mock) => {
    if (c.state !== 'running') return false;
    emit('kill', c, { signal: '15' });
    await sleep(700);
    c.state = 'exited';
    emit('die', c, { exitCode: '0' });
    emit('stop', c);
    return true;
  };
  const start = (c: Mock) => {
    if (c.state === 'running') return false;
    c.state = 'running'; c.since = Date.now();
    emit('start', c);
    return true;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const p = url.pathname.replace(/^\/v[\d.]+/, '');
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

    if (p === '/_ping') { res.writeHead(200); res.end('OK'); return; }

    if (p === '/containers/json') {
      let list = containers;
      const f = url.searchParams.get('filters');
      if (f) { const ids = (JSON.parse(f) as { id?: string[] }).id; if (ids) list = list.filter(c => ids.includes(c.id)); }
      if (url.searchParams.get('all') !== '1') list = list.filter(c => c.state === 'running');
      return json(200, list.map(toApi));
    }

    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    const imageInspect = p.match(/^\/images\/(.+)\/json$/);
    if (imageInspect) {
      const reference = decodeURIComponent(imageInspect[1]);
      const c = containers.find(item => item.image === reference);
      if (!c) return json(404, { message: `No such image: ${reference}` });
      const repo = reference.replace(/:[^/:]+$/, '');
      return json(200, { Id: imageDigest(c.image), RepoDigests: [`${repo}@${imageDigest(c.image)}`] });
    }

    const distribution = p.match(/^\/distribution\/(.+)\/json$/);
    if (distribution) {
      const reference = decodeURIComponent(distribution[1]);
      const c = containers.find(item => item.image === reference);
      if (!c) return json(404, { message: `No such image: ${reference}` });
      const digest = imageDigest(c.name === 'my-app' ? `${c.image}-updated` : c.image);
      return json(200, { Descriptor: { digest } });
    }

    const m = p.match(/^\/containers\/([^/]+)\/(json|start|stop|restart|logs)$/);
    if (!m) return json(404, { message: 'page not found' });
    const c = find(decodeURIComponent(m[1]));
    if (!c) return json(404, { message: `No such container: ${m[1]}` });

    if (m[2] === 'json') return json(200, { Id: c.id, Config: { Tty: false } });

    if (m[2] === 'logs') {
      const frames: Buffer[] = [];
      for (let i = 30; i > 0; i--) {
        const ts = new Date(Date.now() - i * 20_000).toISOString();
        const line = i === 7 ? `${ts} [warn] slow database connection (820 ms)\n` : `${ts} [info] ${c.name}: all good, request ${1000 + i} served\n`;
        const body = Buffer.from(line);
        const head = Buffer.alloc(8); head[0] = i === 7 ? 2 : 1; head.writeUInt32BE(body.length, 4);
        frames.push(head, body);
      }
      res.writeHead(200, { 'Content-Type': 'application/vnd.docker.multiplexed-stream' });
      res.end(Buffer.concat(frames));
      return;
    }

    if (req.method !== 'POST') return json(405, { message: 'method not allowed' });
    if (m[2] === 'start') { res.writeHead(start(c) ? 204 : 304); res.end(); return; }
    if (m[2] === 'stop') { const did = await stop(c); res.writeHead(did ? 204 : 304); res.end(); return; }
    // restart
    await stop(c); await sleep(300); start(c); emit('restart', c);
    res.writeHead(204); res.end();
  });

  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;

  // Simulates an app that crashes now and then and comes back by itself (Docker's restart policy).
  if (opts.crashes !== false) {
    const vault = find('vaultwarden')!;
    const crash = async () => {
      if (vault.state === 'running') {
        vault.state = 'restarting'; vault.health = undefined;
        emit('oom', vault);
        emit('die', vault, { exitCode: '137' });
        await sleep(3500);
        vault.state = 'running'; vault.health = 'healthy'; vault.since = Date.now();
        emit('start', vault);
      }
      const t = setTimeout(crash, 60_000 + Math.random() * 60_000);
      timers.add(t);
    };
    timers.add(setTimeout(crash, 25_000));
  }

  return {
    port,
    containers,
    close: async () => {
      for (const t of timers) clearTimeout(t);
      for (const s of streams) s.end();
      server.closeAllConnections?.();
      await new Promise<void>(r => server.close(() => r()));
    },
  };
}
