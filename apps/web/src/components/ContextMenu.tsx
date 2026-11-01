import { useEffect, useRef, type CSSProperties } from 'react';
import { M3eBottomSheet } from '@m3e/react/bottom-sheet';
import { M3eDivider } from '@m3e/react/divider';
import { M3eActionList, M3eListAction } from '@m3e/react/list';
import { M3eMenu, M3eMenuItem } from '@m3e/react/menu';
import type { M3eMenuElement } from '@m3e/web/menu';
import { useStore } from '@/lib/store';
import { useUi } from '@/lib/ui';
import { appUrl, runAction } from '@/lib/actions';
import { isBusy } from '@/lib/status';
import { Icon } from '@/ui/Icon';
import { useT } from '@/lib/i18n';

const DANGER = { '--m3e-menu-item-color': 'var(--md-sys-color-error)' } as CSSProperties;

/** A Material 3 menu next to the ⋮ button on desktop, and a bottom sheet on phones. */
export function ContextMenu() {
  const t = useT();
  const menu = useUi(s => s.menu);
  const close = useUi(s => s.closeMenu);
  const set = useUi(s => s.set);
  const service = useStore(s => (menu ? s.services[menu.id] : undefined));
  const ref = useRef<M3eMenuElement>(null);
  const sheet = window.innerWidth < 768;

  useEffect(() => { if (menu && !sheet) ref.current?.show(menu.anchor); }, [menu, sheet]);

  type Item = { key: string; icon: string; label: string; disabled?: boolean; danger?: boolean; run: () => void };
  let items: Item[] = [];
  let last: Item | null = null;
  if (service) {
    const busy = isBusy(service.status);
    const off = service.status === 'offline';
    const docker = service.source === 'docker';
    items = [
      { key: 'open', icon: 'open_in_new', label: t('menu.open'), disabled: !appUrl(service), run: () => window.open(appUrl(service)!, '_blank', 'noopener') },
      ...(docker ? [
        { key: 'restart', icon: 'restart_alt', label: t('menu.restart'), disabled: busy || off, run: () => set({ confirm: { kind: 'restart', id: service.id } }) },
        { key: 'pull', icon: 'download', label: 'Atualizar (Pull)', disabled: busy, run: () => set({ confirm: { kind: 'pull', id: service.id } }) },
        off ? { key: 'start', icon: 'play_circle', label: t('menu.start'), disabled: busy, run: () => void runAction(service, 'start') }
            : { key: 'stop', icon: 'stop_circle', label: t('menu.stop'), disabled: busy, run: () => set({ confirm: { kind: 'stop', id: service.id } }) },
        { key: 'logs', icon: 'terminal', label: t('menu.logs'), run: () => set({ logs: service.id }) },
      ] : []),
      { key: 'edit', icon: 'edit', label: t('menu.edit'), run: () => set({ edit: service.id }) },
    ];
    last = docker
      ? { key: 'hide', icon: 'visibility_off', label: t('menu.hide'), run: () => set({ confirm: { kind: 'hide', id: service.id } }) }
      : { key: 'remove', icon: 'delete', label: t('menu.remove'), danger: true, run: () => set({ confirm: { kind: 'remove', id: service.id } }) };
  }
  const all = last ? [...items, last] : items;

  return (
    <>
      <M3eMenu ref={ref} onToggle={e => { if ((e as ToggleEvent).newState === 'closed') close(); }}>
        {!sheet && service && (
          <>
            {items.map(it => (
              <M3eMenuItem key={it.key} disabled={it.disabled} onClick={it.run}><Icon slot="icon" name={it.icon} />{it.label}</M3eMenuItem>
            ))}
            <M3eDivider />
            {last && (
              <M3eMenuItem onClick={last.run} style={last.danger ? DANGER : undefined}><Icon slot="icon" name={last.icon} />{last.label}</M3eMenuItem>
            )}
          </>
        )}
      </M3eMenu>

      {sheet && service && (
        <M3eBottomSheet open modal handle hideable detents={['fit', 'full']} detent={0} handleLabel={t('menu.sheetHandle')} onClosed={close}>
          <span slot="header" className="t-title-m">{service.name}</span>
          <M3eActionList>
            {all.map(it => (
              <M3eListAction key={it.key} disabled={it.disabled} onClick={() => { close(); it.run(); }} className={it.danger ? 'text-error' : undefined}>
                <Icon slot="leading" name={it.icon} />{it.label}
              </M3eListAction>
            ))}
          </M3eActionList>
        </M3eBottomSheet>
      )}
    </>
  );
}
