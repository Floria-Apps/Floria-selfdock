import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Issue, StackAction } from '@shared/types';
import type { Hub } from './hub';
import { HttpError } from './errors';
import { listServices } from './compose-validate';

const ARGS: Record<StackAction, string[]> = {
  up: ['up', '-d', '--remove-orphans'],
  pull: ['pull'],
  restart: ['restart'],
  stop: ['stop'],
  down: ['down'],            // never "-v": we do not delete your data
};
const MAX_OUTPUT = 256 * 1024;
const TIMEOUT_MS = 15 * 60 * 1000;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface JobDeps { hub: Hub; dockerHost: string; demo: boolean }

/** Runs `docker compose` for a stack and streams its output to the dashboard over the WebSocket. */
export class StackJobs {
  private running = new Map<string, { id: string; child?: ChildProcess; timer?: NodeJS.Timeout }>();
  /** True when the docker CLI with the compose plugin is installed. */
  cli = false;

  constructor(private d: JobDeps) {}

  private env() {
    return {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? os.tmpdir(),
      DOCKER_HOST: this.d.dockerHost,
      COMPOSE_ANSI: 'never',
      NO_COLOR: '1',
    };
  }

  async detect(): Promise<boolean> {
    if (this.d.demo) return (this.cli = true);
    this.cli = await new Promise<boolean>(resolve => {
      const c = spawn('docker', ['compose', 'version'], { env: this.env(), stdio: 'ignore' });
      c.on('error', () => resolve(false));
      c.on('exit', code => resolve(code === 0));
    });
    return this.cli;
  }

  isRunning(name: string) { return this.running.has(name); }

  start(name: string, action: StackAction, dir: string, file: string): string {
    if (this.running.has(name)) throw new HttpError(409, 'Another command is already running for this stack.', 'job_running');
    const id = randomUUID();
    const job: { id: string; child?: ChildProcess; timer?: NodeJS.Timeout } = { id };
    this.running.set(name, job);

    let size = 0, truncated = false, pending = '';
    const emit = (chunk: string) => {
      if (size >= MAX_OUTPUT) { if (!truncated) { truncated = true; pending += '\n[output truncated]\n'; } return; }
      size += chunk.length; pending += chunk;
    };
    const flush = setInterval(() => {
      if (pending) { this.d.hub.broadcast({ type: 'stack.job', name, id, action, chunk: pending }); pending = ''; }
    }, 80);
    const finish = (code: number | null) => {
      clearInterval(flush);
      if (job.timer) clearTimeout(job.timer);
      if (pending) this.d.hub.broadcast({ type: 'stack.job', name, id, action, chunk: pending });
      this.d.hub.broadcast({ type: 'stack.job', name, id, action, done: true, code });
      this.running.delete(name);
    };

    emit(`$ docker compose ${ARGS[action].join(' ')}\n`);
    if (this.d.demo) { void this.simulate(name, action, dir, file, emit).then(() => finish(0)); return id; }

    const child = spawn('docker', ['compose', '--ansi', 'never', '--progress', 'plain', '--project-name', name,
      '--project-directory', dir, '-f', path.join(dir, file), ...ARGS[action]], { cwd: dir, env: this.env() });
    job.child = child;
    child.stdout.on('data', b => emit(String(b)));
    child.stderr.on('data', b => emit(String(b)));
    child.on('error', e => { emit(`\n${e.message}\n`); finish(null); });
    child.on('exit', code => finish(code));
    job.timer = setTimeout(() => { emit('\n[timed out after 15 minutes]\n'); child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, TIMEOUT_MS);
    return id;
  }

  /** Demo mode: plausible output without touching Docker. */
  private async simulate(name: string, action: StackAction, dir: string, file: string, emit: (s: string) => void) {
    let services = ['app'];
    try { services = listServices(await fs.readFile(path.join(dir, file), 'utf8')) || services; } catch { /* keep default */ }
    const verbs: Record<StackAction, string[]> = {
      up: ['Pulling', 'Pulled', 'Recreate', 'Recreated', 'Starting', 'Started'],
      pull: ['Pulling', 'Pulled'], restart: ['Restarting', 'Started'], stop: ['Stopping', 'Stopped'], down: ['Stopping', 'Stopped', 'Removing', 'Removed'],
    };
    for (const v of verbs[action]) {
      for (const s of services) { emit(` Container ${name}-${s}-1  ${v}\n`); await sleep(220); }
    }
  }

  /** Asks `docker compose config` to check the files, which catches schema errors our own check cannot. */
  async configCheck(dir: string, compose: string, env: string | null): Promise<Issue[]> {
    if (!this.cli || this.d.demo) return [];
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'selfdock-cfg-'));
    try {
      const args = ['compose', '--project-directory', dir, '-f', '-'];
      if (env !== null) { await fs.writeFile(path.join(tmp, 'env'), env, { mode: 0o600 }); args.push('--env-file', path.join(tmp, 'env')); }
      args.push('config', '--quiet');
      const err = await new Promise<string>(resolve => {
        const c = spawn('docker', args, { cwd: dir, env: this.env() });
        let out = '';
        c.stderr.on('data', b => { out += String(b); });
        c.on('error', e => resolve(e.message));
        c.on('exit', code => resolve(code === 0 ? '' : out || 'compose config failed'));
        c.stdin.end(compose);
        setTimeout(() => c.kill('SIGKILL'), 20_000).unref();
      });
      return err ? [{ level: 'error', code: 'compose_config', file: 'compose', params: { detail: err.trim().slice(0, 400) } }] : [];
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
  }
}
