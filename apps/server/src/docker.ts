import http from 'node:http';

export interface DockerPort { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }
export interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  Labels: Record<string, string>;
  State: string;
  Status: string;
  Ports: DockerPort[];
  Created: number;
}
export interface DockerEvent {
  Type: string;
  Action: string;
  Actor: { ID: string; Attributes: Record<string, string> };
  time: number;
}

type Target = { socketPath: string } | { host: string; port: number };

export class DockerError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function parseDockerHost(value: string): Target {
  if (value.startsWith('unix://')) return { socketPath: value.slice('unix://'.length) };
  if (value.startsWith('npipe://')) return { socketPath: value.slice('npipe://'.length) };
  const m = value.match(/^(?:tcp|http):\/\/([^:/]+):(\d+)/);
  if (m) return { host: m[1], port: Number(m[2]) };
  throw new Error(`Invalid DOCKER_HOST: ${value}`);
}

/** Minimal Docker Engine API client, with no dependencies. */
export class DockerClient {
  private target: Target;
  constructor(dockerHost: string) { this.target = parseDockerHost(dockerHost); }

  setHost(dockerHost: string) { this.target = parseDockerHost(dockerHost); }

  private request(method: string, path: string, timeoutMs = 10_000) {
    return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const req = http.request({ ...this.target, method, path, headers: { Host: 'docker' }, timeout: timeoutMs }, res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      });
      req.on('timeout', () => req.destroy(new Error('Docker took too long to respond.')));
      req.on('error', reject);
      req.end();
    });
  }

  private fail(status: number, body: Buffer): never {
    let msg = body.toString('utf8').slice(0, 300);
    try { msg = (JSON.parse(msg) as { message?: string }).message ?? msg; } catch { /* plain text */ }
    throw new DockerError(status, msg || `Docker error ${status}`);
  }

  private async json<T>(path: string): Promise<T> {
    const r = await this.request('GET', path);
    if (r.status >= 400) this.fail(r.status, r.body);
    return JSON.parse(r.body.toString('utf8')) as T;
  }

  async ping(): Promise<void> {
    const r = await this.request('GET', '/_ping', 4000);
    if (r.status >= 400) this.fail(r.status, r.body);
  }

  listContainers(): Promise<DockerContainer[]> {
    return this.json('/containers/json?all=1');
  }

  async listOne(id: string): Promise<DockerContainer | null> {
    const filters = encodeURIComponent(JSON.stringify({ id: [id] }));
    const list = await this.json<DockerContainer[]>(`/containers/json?all=1&filters=${filters}`);
    return list[0] ?? null;
  }

  async imageUpdateStatus(reference: string): Promise<'current' | 'outdated'> {
    if (reference.includes('@sha256:')) return 'current';
    const encoded = encodeURIComponent(reference);
    try {
      const [local, remote] = await Promise.all([
        this.json<{ RepoDigests?: string[] }>(`/images/${encoded}/json`),
        this.json<{ Descriptor?: { digest?: string } }>(`/distribution/${encoded}/json`),
      ]);
      const remoteDigest = remote.Descriptor?.digest;
      if (!remoteDigest || !local.RepoDigests?.length) return 'current';
      return local.RepoDigests.some(repoDigest => repoDigest.endsWith(`@${remoteDigest}`)) ? 'current' : 'outdated';
    } catch {
      return 'current';
    }
  }

  /** 204 (done) and 304 (already in that state) both mean success. */
  async action(id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    const q = action === 'start' ? '' : '?t=10';
    const r = await this.request('POST', `/containers/${encodeURIComponent(id)}/${action}${q}`, 90_000);
    if (r.status >= 400) this.fail(r.status, r.body);
  }

  async logs(id: string, tail: number): Promise<string> {
    const info = await this.json<{ Config?: { Tty?: boolean } }>(`/containers/${encodeURIComponent(id)}/json`);
    const r = await this.request('GET', `/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&tail=${tail}`, 15_000);
    if (r.status >= 400) this.fail(r.status, r.body);
    return info.Config?.Tty ? r.body.toString('utf8') : demuxDockerLogs(r.body);
  }

  /** Stays open receiving container events. Resolves when the connection closes. */
  events(onEvent: (e: DockerEvent) => void, signal: AbortSignal, onOpen: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { resolve(); return; }
      const filters = encodeURIComponent(JSON.stringify({ type: ['container'] }));
      const req = http.request({ ...this.target, method: 'GET', path: `/events?filters=${filters}`, headers: { Host: 'docker' } }, res => {
        if ((res.statusCode ?? 0) >= 400) {
          res.resume();
          finish(new DockerError(res.statusCode ?? 0, 'Could not subscribe to Docker events.'));
          return;
        }
        onOpen();
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buf += chunk;
          let i: number;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            try { onEvent(JSON.parse(line) as DockerEvent); } catch { /* incomplete or unexpected line */ }
          }
        });
        res.on('end', () => finish());
        res.on('error', finish);
      });
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => {
        req.destroy();
        finish();
      };
      req.on('error', err => finish(signal.aborted ? undefined : err));
      signal.addEventListener('abort', onAbort, { once: true });
      req.end();
    });
  }
}

/** Logs from containers without a TTY come in frames: 1 type byte, 3 zeros and a 4-byte size. */
export function demuxDockerLogs(buf: Buffer): string {
  const out: string[] = [];
  let i = 0;
  while (i < buf.length) {
    if (i + 8 > buf.length) return buf.toString('utf8');
    const type = buf[i];
    if (type > 2 || buf[i + 1] !== 0 || buf[i + 2] !== 0 || buf[i + 3] !== 0) return buf.toString('utf8');
    const size = buf.readUInt32BE(i + 4);
    if (i + 8 + size > buf.length) return buf.toString('utf8');
    out.push(buf.subarray(i + 8, i + 8 + size).toString('utf8'));
    i += 8 + size;
  }
  return out.join('');
}
