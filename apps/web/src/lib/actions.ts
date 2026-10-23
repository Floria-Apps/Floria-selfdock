import type { Action, Service } from '@shared/types';
import { api, ApiError } from './api';
import { tr, type Key } from './i18n';
import { useStore } from './store';

const say = (t: string, tone?: 'info' | 'success' | 'error') => useStore.getState().say(t, tone);

/** Turns any error into text in the user's language, using the server's error code when there is one. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const key = `err.${e.code}` as Key;
    const translated = e.code ? tr(key) : '';
    return translated && translated !== key ? translated : e.message;
  }
  return e instanceof Error ? e.message : tr('err.generic');
}

export async function runAction(s: Service, action: Action) {
  try {
    await api.act(s.id, action);
    say(tr(`action.done.${action}` as Key, { name: s.name }), 'success');
  } catch (e) {
    say(errorText(e), 'error');
  }
}

/** Address to open the app: the container's `floria.url` label, or this machine's address plus the published port. */
export function appUrl(s: Service): string | null {
  if (s.url) return s.url;
  if (s.port) return `${location.protocol}//${location.hostname}:${s.port}`;
  return null;
}

export function openApp(s: Service) {
  const url = appUrl(s);
  if (!url) { say(tr('action.noAddress', { name: s.name })); return; }
  window.open(url, '_blank', 'noopener');
}
