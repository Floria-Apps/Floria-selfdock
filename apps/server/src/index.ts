import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { CATEGORY_IDS } from '@shared/categories';
import { config } from './config';
import { numSetting, openDb, setSetting } from './db';
import { Auth, COOKIE_NAME, LoginLimiter } from './auth';
import { DockerClient } from './docker';
import { Hub } from './hub';
import { IconStore } from './icons';
import { MetricsCollector } from './metrics';
import { Registry } from './registry';
import { HttpError } from './errors';
import { StackStore } from './stacks';
import { StackJobs } from './stack-jobs';
import { registerStackRoutes } from './stacks-routes';

const VERSION = '0.1.0';

async function main() {
  const db = openDb(config.dataDir);
  const auth = new Auth(db);
  const limiter = new LoginLimiter();
  const hub = new Hub();
  const docker = new DockerClient(config.dockerHost);
  const icons = new IconStore(config.dataDir, db, config.iconBases, config.iconsOffline);
  const metrics = new MetricsCollector(config.diskPath ?? config.dataDir);
  const registry = new Registry({ db, docker, hub, icons, metrics });

  let stopDemo: (() => Promise<void>) | null = null;
  if (config.demo) {
    const { startMockDocker } = await import('./dev/mock-docker');
    const mock = await startMockDocker();
    docker.setHost(`tcp://127.0.0.1:${mock.port}`);
    stopDemo = mock.close;
  }

  // Stack editor: only on when a stacks folder is configured (demo mode makes one with sample stacks).
  let stacksDir = config.stacksDir;
  if (!stacksDir && config.demo) {
    const { seedDemoStacks } = await import('./dev/demo-stacks');
    stacksDir = path.join(config.dataDir, 'demo-stacks');
    seedDemoStacks(stacksDir);
  }
  if (stacksDir && !fs.existsSync(stacksDir)) throw new Error(`FLORIA_STACKS_DIR does not exist: ${stacksDir}`);
  const stacks = stacksDir ? new StackStore(stacksDir, path.join(config.dataDir, 'stack-backups')) : null;
  const jobs = new StackJobs({ hub, dockerHost: config.dockerHost, demo: config.demo });
  if (stacks) await jobs.detect();

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: config.trustProxy });
  await app.register(cookie);
  await app.register(websocket);

  /* ---------- basic security ---------- */
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'self'");
  });

  const sameOrigin = (req: FastifyRequest) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.host; } catch { return false; }
  };

  const PUBLIC = new Set(['/api/health', '/api/auth/state', '/api/auth/setup', '/api/auth/login', '/api/ws']);
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0];
    if (!url.startsWith('/api/')) return;
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
      return reply.code(403).send({ error: 'Origin not allowed.', code: 'origin_not_allowed' });
    }
    if (PUBLIC.has(url)) return;
    if (!auth.userFromToken(req.cookies[COOKIE_NAME])) return reply.code(401).send({ error: 'Please log in to continue.', code: 'login_required' });
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code });
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      return reply.code(400).send({ error: `Invalid value${first?.path.length ? ` for "${first.path.join('.')}"` : ''}: ${first?.message ?? 'check the fields'}`, code: 'invalid' });
    }
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on the server.', code: 'server_error' });
  });

  /* ---------- health and login ---------- */
  app.get('/api/health', async () => ({ ok: true, version: VERSION, docker: registry.dockerState.ok }));

  const setCookie = (req: FastifyRequest, reply: import('fastify').FastifyReply, token: string) =>
    reply.setCookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: auth.ttlSeconds(), secure: req.protocol === 'https' });

  app.get('/api/auth/state', async req => {
    const user = auth.userFromToken(req.cookies[COOKIE_NAME]);
    return { setupRequired: auth.userCount() === 0, user: user ? { username: user.username } : null, demo: config.demo };
  });

  const credentials = z.object({
    username: z.string().trim().min(3, 'use at least 3 characters').max(32).regex(/^[a-zA-Z0-9._-]+$/, 'use only letters, numbers, dots, dashes or underscores'),
    password: z.string().min(8, 'use at least 8 characters').max(200),
  });

  app.post('/api/auth/setup', async (req, reply) => {
    if (auth.userCount() > 0) throw new HttpError(403, 'SelfDock is already set up. Log in with your account.', 'already_setup');
    const body = credentials.parse(req.body);
    const id = auth.createUser(body.username, body.password);
    setCookie(req, reply, auth.createSession(id));
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    if (!limiter.allow(req.ip)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.', 'too_many_attempts');
    const body = z.object({ username: z.string().max(64), password: z.string().max(200) }).parse(req.body);
    const token = auth.login(body.username, body.password);
    if (!token) throw new HttpError(401, 'Wrong username or password.', 'bad_credentials');
    limiter.clear(req.ip);
    setCookie(req, reply, token);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    auth.logout(req.cookies[COOKIE_NAME]);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  /* ---------- services ---------- */
  const idParam = (req: FastifyRequest) => z.object({ id: z.string().min(1).max(200) }).parse(req.params).id;

  app.get('/api/services', async () => registry.list());

  app.post('/api/services/:id/action', async req => {
    const { action } = z.object({ action: z.enum(['start', 'stop', 'restart']) }).parse(req.body);
    await registry.act(idParam(req), action);
    return { ok: true };
  });

  app.patch('/api/services/:id', async req => {
    const body = z.object({
      name: z.string().max(60).optional(),
      icon: z.string().max(60).optional(),
      category: z.string().refine(v => CATEGORY_IDS.includes(v), 'unknown category').optional(),
      hidden: z.boolean().optional(),
    }).parse(req.body);
    await registry.patch(idParam(req), body);
    return { ok: true };
  });

  app.post('/api/services/manual', async req => {
    const body = z.object({
      name: z.string().trim().min(1, 'give the app a name').max(60),
      url: z.string().url('invalid address').refine(u => /^https?:\/\//i.test(u), 'use an http:// or https:// address'),
      description: z.string().max(120).optional(),
      category: z.string().refine(v => CATEGORY_IDS.includes(v), 'unknown category').optional(),
      icon: z.string().max(60).optional(),
    }).parse(req.body);
    return registry.addManual(body);
  });

  app.delete('/api/services/:id', async req => {
    registry.removeManual(idParam(req));
    return { ok: true };
  });

  app.get('/api/services/:id/logs', async req => {
    const { tail } = z.object({ tail: z.coerce.number().int().min(1).max(1000).default(200) }).parse(req.query);
    return { text: await registry.logs(idParam(req), tail) };
  });

  /* ---------- history, alerts, settings ---------- */
  app.get('/api/history', async req => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    return registry.history(limit);
  });

  app.post('/api/alerts/:id/dismiss', async req => {
    registry.dismissAlert(idParam(req));
    return { ok: true };
  });

  app.get('/api/settings', async () => ({
    metricsIntervalSec: numSetting(db, 'metrics_interval', 5),
    checkIntervalSec: numSetting(db, 'check_interval', 30),
    version: VERSION,
    dockerHost: config.dockerHost,
    demo: config.demo,
  }));

  app.put('/api/settings', async req => {
    const body = z.object({
      metricsIntervalSec: z.number().int().min(2).max(60),
      checkIntervalSec: z.number().int().min(10).max(600),
    }).parse(req.body);
    setSetting(db, 'metrics_interval', String(body.metricsIntervalSec));
    setSetting(db, 'check_interval', String(body.checkIntervalSec));
    return { ok: true };
  });

  /* ---------- icons ---------- */
  app.get('/api/icons/:file', async (req, reply) => {
    const { file } = z.object({ file: z.string().regex(/^[a-z0-9._-]+\.(svg|png)$/) }).parse(req.params);
    const full = path.join(icons.dir, file);
    if (!fs.existsSync(full)) throw new HttpError(404, 'Icon not found.', 'icon_not_found');
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    reply.type(file.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    return reply.send(fs.createReadStream(full));
  });

  /* ---------- stack editor (compose and .env files) ---------- */
  registerStackRoutes({ app, store: stacks, jobs, registry, applyAllowed: config.stacksApply || config.demo });

  /* ---------- real time ---------- */
  app.get('/api/ws', { websocket: true }, (socket, req) => {
    if (!sameOrigin(req) || !auth.userFromToken(req.cookies[COOKIE_NAME])) {
      socket.close(4401, 'not authenticated');
      return;
    }
    hub.add(socket);
    socket.send(JSON.stringify(registry.snapshot()));
    const ping = setInterval(() => { if (socket.readyState === 1) socket.ping(); }, 25_000);
    socket.on('close', () => clearInterval(ping));
  });

  /* ---------- dashboard (front-end files) ---------- */
  if (fs.existsSync(path.join(config.publicDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.publicDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found.', code: 'not_found' });
    });
  } else {
    app.log.info('No compiled front-end at %s. In development, use Vite (npm run dev).', config.publicDir);
  }

  await registry.start();
  await app.listen({ port: config.port, host: config.host });

  const shutdown = async () => {
    registry.stop();
    hub.closeAll();
    await app.close();
    await stopDemo?.();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
