import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Alert, DockerState, Metrics, Service, StackAction } from '@shared/types';
import type { ColorStyle, Contrast } from './color';

export type AuthStatus = 'loading' | 'setup' | 'login' | 'ready';
export type Conn = 'connecting' | 'open' | 'closed';

/** Live output of the last `docker compose` command run for a stack. */
export interface StackJob { id: string; action: StackAction; text: string; running: boolean; code: number | null }

interface LiveState {
  auth: AuthStatus;
  username: string | null;
  demo: boolean;
  services: Record<string, Service>;
  metrics: Metrics | null;
  alerts: Alert[];
  docker: DockerState;
  conn: Conn;
  /** Goes up when the server says the history changed. */
  historyVersion: number;
  jobs: Record<string, StackJob>;
  snack: { text: string; key: number } | null;
  setAuth: (a: AuthStatus, username?: string | null) => void;
  say: (text: string) => void;
}

export const useStore = create<LiveState>(set => ({
  auth: 'loading',
  username: null,
  demo: false,
  services: {},
  metrics: null,
  alerts: [],
  docker: { ok: true },
  conn: 'connecting',
  historyVersion: 0,
  jobs: {},
  snack: null,
  setAuth: (auth, username) => set(s => ({ auth, username: username === undefined ? s.username : username })),
  say: text => set({ snack: { text, key: Date.now() } }),
}));

export type ThemeMode = 'auto' | 'light' | 'dark';
export type LangPref = 'auto' | 'en' | 'pt-BR';

interface Prefs {
  theme: ThemeMode;
  seed: string;
  colorStyle: ColorStyle;
  contrast: Contrast;
  /** Springy, expressive animations (Material 3 Expressive). */
  expressive: boolean;
  lang: LangPref;
  layout: 'grid' | 'list';
  showPort: boolean;
  showServer: boolean;
  showLogos: boolean;
  showHidden: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}

/** Preferences for this device (kept in the browser). */
export const usePrefs = create<Prefs>()(persist(
  set => ({
    theme: 'auto', seed: 'teal', colorStyle: 'tonal-spot', contrast: 'standard', expressive: true, lang: 'auto', layout: 'grid',
    showPort: true, showServer: true, showLogos: true, showHidden: false,
    set: p => set(p),
  }),
  { name: 'floria-selfdock-prefs' },
));
