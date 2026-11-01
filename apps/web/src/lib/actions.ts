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

export function isSafeHttpUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

export function appLocalUrl(s: Service): string | null {
  if (s.addresses.customized.localUrl) return isSafeHttpUrl(s.addresses.localUrl) ? s.addresses.localUrl : null;
  if (isSafeHttpUrl(s.addresses.localUrl)) return s.addresses.localUrl;
  const mapping = s.addresses.publishedPort;
  if (mapping?.hostPort && (!mapping.hostIp || mapping.hostIp === '0.0.0.0')) {
    return `http://${location.hostname}:${mapping.hostPort}`;
  }
  if (s.addresses.webPortSource === 'label' && !mapping && s.port) return `http://${location.hostname}:${s.port}`;
  return null;
}

/** Chooses an explicitly configured or verified address without treating arbitrary published ports as web ports. */
export function appUrl(s: Service): string | null {
  const localUrl = appLocalUrl(s);
  if (s.addresses.customized.localUrl && localUrl) return localUrl;
  if (isSafeHttpUrl(s.url)) return s.url;
  if (localUrl) return localUrl;
  if (isSafeHttpUrl(s.addresses.tailscaleUrl)) return s.addresses.tailscaleUrl;
  if (isSafeHttpUrl(s.addresses.proxyUrl)) return s.addresses.proxyUrl;
  return null;
}

export function openApp(s: Service) {
  const url = appUrl(s);
  if (!url) { say(tr('action.noAddress', { name: s.name })); return; }
  window.open(url, '_blank', 'noopener');
}
