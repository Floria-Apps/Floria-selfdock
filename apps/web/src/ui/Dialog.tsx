import type { CSSProperties, ReactNode } from 'react';
import { M3eDialog } from '@m3e/react/dialog';
import { useT } from '@/lib/i18n';
import { Icon } from './Icon';

/** A Material 3 dialog. It mounts open; closing it (Escape, the X or the backdrop) calls `onClose`. */
export function Dialog({ title, icon, children, actions, onClose, wide }: {
  title: string; icon?: string; children: ReactNode; actions?: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const t = useT();
  const style = wide ? ({ '--m3e-dialog-max-width': '720px', '--m3e-dialog-min-width': 'min(720px, calc(100vw - 32px))' } as CSSProperties) : undefined;
  return (
    <M3eDialog open dismissible closeLabel={t('common.close')} onClosed={onClose} style={style}>
      <span slot="header">{title}</span>
      {icon && <div className="mb-3 flex justify-center text-secondary"><Icon name={icon} /></div>}
      {children}
      {actions && <div slot="actions" className="flex w-full flex-wrap justify-end gap-2">{actions}</div>}
    </M3eDialog>
  );
}
