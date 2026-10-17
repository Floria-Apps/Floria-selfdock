import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StackBackup, StackFiles } from '@shared/types';
import { HttpError } from './errors';
import { listServices } from './compose-validate';

const COMPOSE_NAMES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_BYTES = 512 * 1024;
const KEEP_BACKUPS = 30;

export const STARTER_COMPOSE = `services:
  app:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports:
      - "\${APP_PORT:-8080}:80"
`;
export const STARTER_ENV = 'APP_PORT=8080\n';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export function assertName(name: string) {
  if (!NAME_RE.test(name)) throw new HttpError(400, 'Invalid stack name. Use lowercase letters, numbers, dashes and underscores.', 'stack_invalid_name');
}

async function exists(p: string) { try { await fs.access(p); return true; } catch { return false; } }

/** Reads and writes the compose and .env files of each stack. Every path is checked to stay inside the stacks folder. */
export class StackStore {
  constructor(readonly root: string, private backupsDir: string) {}

  private async rootReal() { return fs.realpath(this.root); }

  /** Real path of the stack folder, refusing anything that escapes the stacks folder (e.g. through a symlink). */
  private async dirOf(name: string): Promise<string> {
    assertName(name);
    const rootReal = await this.rootReal();
    let real: string;
    try { real = await fs.realpath(path.join(rootReal, name)); }
    catch { throw new HttpError(404, 'Stack not found.', 'stack_not_found'); }
    if (!real.startsWith(rootReal + path.sep)) throw new HttpError(400, 'Invalid stack folder.', 'stack_invalid_name');
    if (!(await fs.stat(real)).isDirectory()) throw new HttpError(404, 'Stack not found.', 'stack_not_found');
    return real;
  }

  /** Path of a file inside a stack folder. If the file is a symlink, its target must also stay inside the stacks folder. */
  private async fileIn(dir: string, file: string): Promise<string> {
    const full = path.join(dir, file);
    try {
      if ((await fs.lstat(full)).isSymbolicLink()) {
        const target = await fs.realpath(full);
        if (!target.startsWith((await this.rootReal()) + path.sep)) throw new HttpError(400, 'Invalid stack file.', 'stack_invalid_name');
        return target;
      }
    } catch (e) { if (e instanceof HttpError) throw e; /* file does not exist yet */ }
    return full;
  }

  private async composeFileName(dir: string): Promise<string> {
    for (const n of COMPOSE_NAMES) if (await exists(path.join(dir, n))) return n;
    throw new HttpError(404, 'Stack not found.', 'stack_not_found');
  }

  /** Folder and compose file name, for running `docker compose`. */
  async location(name: string): Promise<{ dir: string; file: string }> {
    const dir = await this.dirOf(name);
    return { dir, file: await this.composeFileName(dir) };
  }

  async list(): Promise<{ name: string; file: string; hasEnv: boolean; services: string[] }[]> {
    const rootReal = await this.rootReal();
    const out: { name: string; file: string; hasEnv: boolean; services: string[] }[] = [];
    for (const entry of await fs.readdir(rootReal, { withFileTypes: true })) {
      if (!entry.isDirectory() || !NAME_RE.test(entry.name)) continue;
      const dir = path.join(rootReal, entry.name);
      let file: string;
      try { file = await this.composeFileName(dir); } catch { continue; }
      let services: string[] = [];
      try { services = listServices(await fs.readFile(path.join(dir, file), 'utf8')); } catch { /* unreadable */ }
      out.push({ name: entry.name, file, hasEnv: await exists(path.join(dir, '.env')), services });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(name: string): Promise<StackFiles> {
    const dir = await this.dirOf(name);
    const composeFile = await this.composeFileName(dir);
    const compose = await fs.readFile(await this.fileIn(dir, composeFile), 'utf8');
    let env: string | null = null;
    try { env = await fs.readFile(await this.fileIn(dir, '.env'), 'utf8'); } catch (e) { if (e instanceof HttpError) throw e; }
    return { name, composeFile, compose, env, composeHash: sha(compose), envHash: env === null ? null : sha(env) };
  }

  async create(name: string): Promise<StackFiles> {
    assertName(name);
    const dir = path.join(await this.rootReal(), name);
    if (await exists(dir)) throw new HttpError(409, 'A stack with that name already exists.', 'stack_exists');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'compose.yaml'), STARTER_COMPOSE, { mode: 0o644 });
    await fs.writeFile(path.join(dir, '.env'), STARTER_ENV, { mode: 0o600 });
    return this.read(name);
  }

  /**
   * Saves one or both files. `composeHash` / `envHash` must match what is on disk now, so we never overwrite
   * changes made somewhere else (another browser tab, or by hand over SSH). The previous content is kept as a backup.
   */
  async write(name: string, input: { compose?: string; env?: string; composeHash?: string; envHash?: string | null }): Promise<StackFiles> {
    const dir = await this.dirOf(name);
    const current = await this.read(name);
    const jobs: { kind: 'compose' | 'env'; file: string; text: string; previous: string | null; newMode: number }[] = [];

    if (input.compose !== undefined) {
      if (input.composeHash !== current.composeHash) throw new HttpError(409, 'The compose file changed on disk.', 'stack_conflict');
      jobs.push({ kind: 'compose', file: current.composeFile, text: input.compose, previous: current.compose, newMode: 0o644 });
    }
    if (input.env !== undefined) {
      if ((input.envHash ?? null) !== current.envHash) throw new HttpError(409, 'The .env file changed on disk.', 'stack_conflict');
      jobs.push({ kind: 'env', file: '.env', text: input.env, previous: current.env, newMode: 0o600 });
    }
    for (const j of jobs) {
      if (Buffer.byteLength(j.text) > MAX_BYTES) throw new HttpError(413, 'File is too large to edit here.', 'file_too_large');
    }
    for (const j of jobs) {
      const text = j.text === '' || j.text.endsWith('\n') ? j.text : j.text + '\n';
      if (text === j.previous) continue;
      if (j.previous !== null) await this.backup(name, j.kind, j.previous);
      const target = await this.fileIn(dir, j.file);
      let mode = j.newMode;
      try { mode = (await fs.stat(target)).mode & 0o777; } catch { /* new file */ }
      const tmp = `${target}.selfdock-${process.pid}.tmp`;
      await fs.writeFile(tmp, text, { mode });
      await fs.rename(tmp, target);
    }
    return this.read(name);
  }

  /* ---------- backups (kept in the data folder, not next to your files) ---------- */

  private async backup(name: string, kind: 'compose' | 'env', content: string) {
    const dir = path.join(this.backupsDir, name);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(dir, `${String(Date.now()).padStart(14, '0')}-${kind}`), content, { mode: 0o600 });
    const mine = (await fs.readdir(dir)).filter(f => f.endsWith(`-${kind}`)).sort();
    for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) await fs.rm(path.join(dir, old), { force: true });
  }

  async backups(name: string): Promise<StackBackup[]> {
    assertName(name);
    const dir = path.join(this.backupsDir, name);
    let files: string[] = [];
    try { files = await fs.readdir(dir); } catch { return []; }
    const out: StackBackup[] = [];
    for (const f of files) {
      const m = /^(\d{14})-(compose|env)$/.exec(f);
      if (!m) continue;
      out.push({ id: f, file: m[2] as 'compose' | 'env', at: Number(m[1]), size: (await fs.stat(path.join(dir, f))).size });
    }
    return out.sort((a, b) => b.at - a.at);
  }

  async backupContent(name: string, id: string): Promise<string> {
    assertName(name);
    if (!/^\d{14}-(compose|env)$/.test(id)) throw new HttpError(400, 'Invalid backup id.', 'stack_invalid_name');
    try { return await fs.readFile(path.join(this.backupsDir, name, id), 'utf8'); }
    catch { throw new HttpError(404, 'Backup not found.', 'backup_not_found'); }
  }
}
