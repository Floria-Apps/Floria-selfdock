import React, { Suspense, lazy } from 'react';
import { createComponent } from '@lit/react';
import { M3eSnackbarElement } from '@m3e/web/snackbar';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useUi } from '@/lib/ui';
import { ContextMenu } from './ContextMenu';
import { AddDialog, ConfirmDialog, EditDialog, LogsDialog } from './Dialogs';
import { Icon } from '@/ui/Icon';

/** <m3e-snackbar> used inside the theme, so it gets the dashboard's colours and font. */
const Snack = createComponent({ tagName: 'm3e-snackbar', elementClass: M3eSnackbarElement, react: React, events: { onToggle: 'toggle' } });

function Snackbar() {
  const t = useT();
  const snack = useStore(s => s.snack);
  if (!snack) return null;
  const icon = snack.tone === 'error' ? 'error' : snack.tone === 'success' ? 'check_circle' : 'info';
  return (
    <Snack key={snack.key} className={`selfdock-snackbar snackbar-${snack.tone}`} open duration={5500} dismissible closeLabel={t('ui.dismissToast')}
      onToggle={(e: Event) => { if ((e as ToggleEvent).newState === 'closed' && useStore.getState().snack?.key === snack.key) useStore.setState({ snack: null }); }}>
      <span className="snackbar-content"><Icon name={icon} fill /><span>{snack.text}</span></span>
    </Snack>
  );
}

/** The editor and CodeMirror are only downloaded when you open a stack. */
const StackEditor = lazy(() => import('./StackEditor'));

function StackEditorHost() {
  const name = useUi(s => s.stackEdit);
  const set = useUi(s => s.set);
  if (!name) return null;
  return <Suspense fallback={null}><StackEditor key={name} name={name} onClose={() => set({ stackEdit: null })} /></Suspense>;
}

export function Overlays() {
  return (
    <>
      <StackEditorHost />
      <ContextMenu />
      <ConfirmDialog />
      <EditDialog />
      <AddDialog />
      <LogsDialog />
      <Snackbar />
    </>
  );
}
