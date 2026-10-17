import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import { normalizeIconName } from './catalog';

const MISS_TTL = 7 * 24 * 3600 * 1000;
const RETRY_AFTER_NETWORK_ERROR = 10 * 60 * 1000;
const MAX_BYTES = 600_000;

/** Downloads icons from dashboard-icons once and keeps them in the data volume, so the dashboard works offline afterwards. */
export class IconStore {
  readonly dir: string;
  private inflight = new Map<string, Promise<string | null>>();

  constructor(dataDir: string, private db: DB, private bases: string[], private offline: boolean) {
    this.dir = path.join(dataDir, 'icons');
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Returns the file name (`jellyfin.svg`), or null if that icon does not exist. */
  ensure(rawName: string): Promise<string | null> {
    const name = normalizeIconName(rawName);
    if (!name) return Promise.resolve(null);
    let p = this.inflight.get(name);
    if (!p) {
      p = this.load(name).finally(() => this.inflight.delete(name));
      this.inflight.set(name, p);
    }
    return p;
  }

  async firstMatch(candidates: string[]): Promise<string | null> {
    for (const c of candidates) {
      const file = await this.ensure(c);
      if (file) return file;
    }
    return null;
  }

  private async load(name: string): Promise<string | null> {
    for (const ext of ['svg', 'png']) {
      if (fs.existsSync(path.join(this.dir, `${name}.${ext}`))) return `${name}.${ext}`;
    }
    const miss = this.db.prepare('SELECT checked_at FROM icon_cache WHERE name = ?').get(name) as { checked_at: number } | undefined;
    if (miss && Date.now() - miss.checked_at < MISS_TTL) return null;
    if (this.offline) return null;

    let sawNotFound = false;
    for (const ext of ['svg', 'png']) {
      for (const base of this.bases) {
        try {
          const res = await fetch(`${base}/${ext}/${name}.${ext}`, { signal: AbortSignal.timeout(6000) });
          if (res.status === 404) { sawNotFound = true; continue; }
          if (!res.ok) continue;
          const type = res.headers.get('content-type') ?? '';
          const buf = Buffer.from(await res.arrayBuffer());
          if (type.includes('text/html') || buf.length === 0 || buf.length > MAX_BYTES) continue;
          if (ext === 'svg' && !buf.subarray(0, 400).toString('utf8').includes('<svg')) continue;
          fs.writeFileSync(path.join(this.dir, `${name}.${ext}`), buf);
          this.db.prepare('DELETE FROM icon_cache WHERE name = ?').run(name);
          return `${name}.${ext}`;
        } catch { /* no network or timeout: try the next source */ }
      }
    }
    // If there were only network errors, retry soon; if the icon really does not exist, remember that for 7 days.
    const checkedAt = sawNotFound ? Date.now() : Date.now() - MISS_TTL + RETRY_AFTER_NETWORK_ERROR;
    this.db.prepare('INSERT INTO icon_cache(name, checked_at) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET checked_at = excluded.checked_at').run(name, checkedAt);
    return null;
  }
}
