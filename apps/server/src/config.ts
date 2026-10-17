import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR ?? './data'),
  /** unix:///var/run/docker.sock, npipe:////./pipe/docker_engine or tcp://docker-proxy:2375 */
  dockerHost: env.DOCKER_HOST ?? 'unix:///var/run/docker.sock',
  /** Folder used to measure disk usage. Mount the host root (e.g. /host) to measure the real disk. */
  diskPath: env.DISK_PATH,
  publicDir: path.resolve(env.PUBLIC_DIR ?? path.join(import.meta.dirname, '../public')),
  /** Set FLORIA_TRUST_PROXY=1 behind a reverse proxy (Caddy, Traefik, Nginx). */
  trustProxy: env.FLORIA_TRUST_PROXY === '1',
  /** Demo mode: starts a fake Docker so you can try the dashboard without Docker. */
  demo: env.FLORIA_DEMO === '1',
  iconBases: (env.FLORIA_ICON_BASES ??
    'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons,https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main')
    .split(',').map(s => s.trim()).filter(Boolean),
  iconsOffline: env.FLORIA_ICONS_OFFLINE === '1',
  /** Folder with one sub-folder per stack (compose file + .env). Mount it at the same path as on the host. Unset = editor off. */
  stacksDir: env.FLORIA_STACKS_DIR ? path.resolve(env.FLORIA_STACKS_DIR) : undefined,
  /** Allow running `docker compose up/down/...` from the dashboard. Needs the docker CLI and wider Docker access. */
  stacksApply: env.FLORIA_STACKS_APPLY === '1',
};

export type Config = typeof config;
