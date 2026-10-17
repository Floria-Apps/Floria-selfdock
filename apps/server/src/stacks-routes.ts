import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StacksInfo } from '@shared/types';
import { validateStack } from './compose-validate';
import { HttpError } from './errors';
import type { Registry } from './registry';
import { StackJobs } from './stack-jobs';
import { StackStore, assertName } from './stacks';

interface Deps {
  app: FastifyInstance;
  store: StackStore | null;
  jobs: StackJobs;
  registry: Registry;
  /** FLORIA_STACKS_APPLY=1 (or demo mode). It also needs the docker CLI. */
  applyAllowed: boolean;
}

const MAX = 512 * 1024;

export function registerStackRoutes({ app, store, jobs, registry, applyAllowed }: Deps) {
  const need = () => {
    if (!store) throw new HttpError(404, 'The stack editor is turned off.', 'stacks_disabled');
    return store;
  };
  const name = (req: { params: unknown }) => { const n = z.object({ name: z.string().max(80) }).parse(req.params).name; assertName(n); return n; };
  const applyOn = () => applyAllowed && jobs.cli;

  app.get('/api/stacks', async (): Promise<StacksInfo> => {
    if (!store) return { enabled: false, apply: false, stacks: [] };
    const counts = await registry.projectCounts().catch(() => new Map<string, { running: number; total: number }>());
    const stacks = (await store.list()).map(s => ({ ...s, running: counts.get(s.name)?.running ?? 0, total: counts.get(s.name)?.total ?? 0 }));
    return { enabled: true, apply: applyOn(), root: store.root, stacks };
  });

  app.post('/api/stacks', async req => {
    const body = z.object({ name: z.string().max(80) }).parse(req.body);
    return need().create(body.name);
  });

  app.post('/api/stacks/validate', async req => {
    const s = need();
    const body = z.object({
      name: z.string().max(80).default('new'),
      compose: z.string().max(MAX),
      env: z.string().max(MAX).nullable().default(null),
    }).parse(req.body);
    assertName(body.name);
    const running = await registry.containersOverview().catch(() => null);
    const result = validateStack(body.compose, body.env, { project: body.name, running });
    if (jobs.cli) {
      const dir = await s.location(body.name).then(l => l.dir).catch(() => s.root);
      result.issues.push(...await jobs.configCheck(dir, body.compose, body.env));
    }
    return result;
  });

  app.get('/api/stacks/:name', async req => need().read(name(req)));

  app.put('/api/stacks/:name', async req => {
    const body = z.object({
      compose: z.string().max(MAX).optional(),
      env: z.string().max(MAX).optional(),
      composeHash: z.string().max(100).optional(),
      envHash: z.string().max(100).nullable().optional(),
    }).parse(req.body);
    return need().write(name(req), body);
  });

  app.get('/api/stacks/:name/backups', async req => need().backups(name(req)));

  app.get('/api/stacks/:name/backups/:id', async req => {
    const id = z.object({ id: z.string().max(40) }).parse(req.params).id;
    return { content: await need().backupContent(name(req), id) };
  });

  app.post('/api/stacks/:name/apply', async req => {
    const s = need();
    if (!applyOn()) throw new HttpError(403, 'Running docker compose from the dashboard is turned off.', 'apply_disabled');
    const { action } = z.object({ action: z.enum(['up', 'down', 'pull', 'restart', 'stop']) }).parse(req.body);
    const n = name(req);
    const { dir, file } = await s.location(n);
    return { id: jobs.start(n, action, dir, file) };
  });
}
