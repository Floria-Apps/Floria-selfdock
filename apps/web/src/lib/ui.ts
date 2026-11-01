import { create } from 'zustand';

/** State of the layers that sit on top of the dashboard (menus and dialogs). */
interface UiState {
  menu: { id: string; anchor: HTMLElement } | null;
  confirm: { kind: 'restart' | 'pull' | 'stop' | 'hide' | 'remove'; id: string } | null;
  edit: string | null;
  adding: boolean;
  logs: string | null;
  /** Name of the stack open in the compose editor. */
  stackEdit: string | null;
  openMenu: (id: string, anchor: HTMLElement) => void;
  closeMenu: () => void;
  set: (p: Partial<Omit<UiState, 'set' | 'openMenu' | 'closeMenu'>>) => void;
}

export const useUi = create<UiState>(set => ({
  menu: null, confirm: null, edit: null, adding: false, logs: null, stackEdit: null,
  openMenu: (id, anchor) => set({ menu: { id, anchor } }),
  closeMenu: () => set({ menu: null }),
  set: p => set(p),
}));
