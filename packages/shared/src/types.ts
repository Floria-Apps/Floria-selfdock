/** Types shared between the server and the web dashboard. */

export type Status = 'online' | 'offline' | 'restarting' | 'starting' | 'stopping' | 'unhealthy' | 'paused';
export type Action = 'start' | 'stop' | 'restart';
export type Source = 'docker' | 'manual';
export type ImageUpdateStatus = 'checking' | 'current' | 'outdated' | 'unknown';

export interface Service {
  /** Stable key: `docker:<container-name>` or `manual:<id>`. */
  id: string;
  source: Source;
  name: string;
  /** Text written by the user (label or manual service). Empty when the dashboard should use its own wording. */
  description: string;
  /** Key of a well-known app (e.g. `jellyfin`). The dashboard translates its description. */
  catalog: string | null;
  /** File name served at /api/icons/<file>, or null (the dashboard then shows a fallback icon). */
  icon: string | null;
  category: string;
  port: number | null;
  /** Only set when the app declared `floria.url` (or for manual services). */
  url: string | null;
  image: string | null;
  imageUpdateStatus?: ImageUpdateStatus;
  status: Status;
  hidden: boolean;
}

export interface Metrics {
  at: number;
  cpu: number;
  ram: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  uptime: number;
  containers: { running: number; total: number };
}

export type AlertKind = 'disk' | 'ram' | 'loop' | 'down' | 'unhealthy';

/** Alerts carry a kind and parameters; the dashboard turns them into text in the user's language. */
export interface Alert {
  id: string;
  level: 'warning' | 'error';
  icon: string;
  kind: AlertKind;
  params: Record<string, string | number>;
  at: number;
  action?: { kind: 'logs' | 'history'; serviceId?: string };
}

/**
 * Why an app went down:
 * `oom`, `killed` (exit 137), `sigterm` (exit 143), `exit0`, `exit:<n>`, `unhealthy`, `user` (stopped from the dashboard).
 */
export type Cause = string;

export interface Incident {
  id: number;
  serviceId: string;
  serviceName: string;
  kind: string;
  /** A stop the user asked for in the dashboard. It does not count as downtime. */
  planned: boolean;
  cause: Cause | null;
  startedAt: number;
  endedAt: number | null;
}

export interface Availability {
  serviceId: string;
  name: string;
  last24h: number;
  last7d: number;
  incidents7d: number;
  downtime24hMs: number;
  downtime7dMs: number;
}

export type DockerErrorCode = 'socket_not_found' | 'permission_denied' | 'connection_refused' | 'other';
export interface DockerState { ok: boolean; code?: DockerErrorCode; detail?: string }

export interface Settings { metricsIntervalSec: number; checkIntervalSec: number }

export type IssueLevel = 'error' | 'warning' | 'info';

/** A problem found while checking a compose file or a .env file. The dashboard translates `code`. */
export interface Issue {
  level: IssueLevel;
  code: string;
  file: 'compose' | 'env';
  line?: number;
  col?: number;
  params?: Record<string, string | number>;
}

export interface StackSummary {
  name: string;
  file: string;
  hasEnv: boolean;
  services: string[];
  running: number;
  total: number;
}

export interface StacksInfo {
  /** The stacks folder is mounted, so files can be edited. */
  enabled: boolean;
  /** Running `docker compose up/down/...` from the dashboard is allowed and available. */
  apply: boolean;
  root?: string;
  stacks: StackSummary[];
}

export interface StackFiles {
  name: string;
  composeFile: string;
  compose: string;
  /** null when the stack has no .env yet. */
  env: string | null;
  composeHash: string;
  envHash: string | null;
}

export interface StackValidation { issues: Issue[]; services: string[] }

export interface StackBackup { id: string; file: 'compose' | 'env'; at: number; size: number }

export type StackAction = 'up' | 'down' | 'pull' | 'restart' | 'stop';

export type ServerMsg =
  | { type: 'snapshot'; services: Service[]; metrics: Metrics | null; alerts: Alert[]; docker: DockerState }
  | { type: 'service.upsert'; service: Service }
  | { type: 'service.remove'; id: string }
  | { type: 'metrics'; metrics: Metrics }
  | { type: 'alerts'; alerts: Alert[] }
  | { type: 'docker'; docker: DockerState }
  | { type: 'history.changed' }
  /** Output of a `docker compose` command started from the stack editor. */
  | { type: 'stack.job'; name: string; id: string; action: StackAction; chunk?: string; done?: boolean; code?: number | null };
