import type { Status } from '@shared/types';
import { tr, type Key } from './i18n';

export const STATUS_COLORS: Record<Status, { bg: string; fg: string; dot: string }> = {
  online: { bg: 'var(--success-container)', fg: 'var(--on-success-container)', dot: 'var(--success)' },
  offline: { bg: 'var(--error-container)', fg: 'var(--on-error-container)', dot: 'var(--error)' },
  unhealthy: { bg: 'var(--warning-container)', fg: 'var(--on-warning-container)', dot: 'var(--warning)' },
  paused: { bg: 'var(--secondary-container)', fg: 'var(--on-secondary-container)', dot: 'var(--secondary)' },
  restarting: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary-container)', dot: 'var(--tertiary)' },
  starting: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary-container)', dot: 'var(--tertiary)' },
  stopping: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary-container)', dot: 'var(--tertiary)' },
};

export const statusLabel = (s: Status) => tr(`status.${s}` as Key);

/** The app is changing state and has not settled yet. */
export const isBusy = (s: Status) => s === 'restarting' || s === 'starting' || s === 'stopping';
/** The app is not usable and needs attention. */
export const isDown = (s: Status) => s === 'offline' || s === 'unhealthy' || s === 'paused';
