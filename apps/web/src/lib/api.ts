import type { Action, Availability, Incident, Service, Settings, StackAction, StackBackup, StackFiles, StacksInfo, StackValidation } from '@shared/types';
import { tr } from './i18n';
import { useStore } from './store';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, tr('err.network'), 'network');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.status === 401 && !path.startsWith('/auth/')) useStore.getState().setAuth('login');
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Error ${res.status}`, data.code);
  return data as T;
}

export interface AuthState { setupRequired: boolean; user: { username: string } | null; demo: boolean }
export interface HistoryData { incidents: Incident[]; availability: Availability[]; trackedSince: number }
export type SettingsData = Settings & { version: string; dockerHost: string; demo: boolean };

export const api = {
  authState: () => request<AuthState>('/auth/state'),
  setup: (username: string, password: string) => request<{ ok: true }>('/auth/setup', { method: 'POST', body: { username, password } }),
  login: (username: string, password: string) => request<{ ok: true }>('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST', body: {} }),
  act: (id: string, action: Action) => request<{ ok: true }>(`/services/${encodeURIComponent(id)}/action`, { method: 'POST', body: { action } }),
  patch: (id: string, body: { name?: string; icon?: string; category?: string; hidden?: boolean }) =>
    request<{ ok: true }>(`/services/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  addManual: (body: { name: string; url: string; category?: string; description?: string }) =>
    request<Service>('/services/manual', { method: 'POST', body }),
  remove: (id: string) => request<{ ok: true }>(`/services/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  logs: (id: string, tail = 200) => request<{ text: string }>(`/services/${encodeURIComponent(id)}/logs?tail=${tail}`),
  history: () => request<HistoryData>('/history?limit=150'),
  dismiss: (id: string) => request<{ ok: true }>(`/alerts/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: {} }),
  settings: () => request<SettingsData>('/settings'),
  saveSettings: (s: Settings) => request<{ ok: true }>('/settings', { method: 'PUT', body: s }),

  stacks: () => request<StacksInfo>('/stacks'),
  stack: (name: string) => request<StackFiles>(`/stacks/${encodeURIComponent(name)}`),
  createStack: (name: string) => request<StackFiles>('/stacks', { method: 'POST', body: { name } }),
  saveStack: (name: string, body: { compose?: string; env?: string; composeHash?: string; envHash?: string | null }) =>
    request<StackFiles>(`/stacks/${encodeURIComponent(name)}`, { method: 'PUT', body }),
  validateStack: (body: { name: string; compose: string; env: string | null }) =>
    request<StackValidation>('/stacks/validate', { method: 'POST', body }),
  stackBackups: (name: string) => request<StackBackup[]>(`/stacks/${encodeURIComponent(name)}/backups`),
  stackBackup: (name: string, id: string) => request<{ content: string }>(`/stacks/${encodeURIComponent(name)}/backups/${encodeURIComponent(id)}`),
  applyStack: (name: string, action: StackAction) =>
    request<{ id: string }>(`/stacks/${encodeURIComponent(name)}/apply`, { method: 'POST', body: { action } }),
};
