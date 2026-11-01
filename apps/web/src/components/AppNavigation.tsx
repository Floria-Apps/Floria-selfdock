import { Fragment, useState } from 'react';
import { M3eBadge } from '@m3e/react/badge';
import { M3eBottomSheet } from '@m3e/react/bottom-sheet';
import { M3eFab } from '@m3e/react/fab';
import { M3eActionList, M3eListAction } from '@m3e/react/list';
import { M3eNavItem } from '@m3e/react/nav-bar';
import { M3eNavRail } from '@m3e/react/nav-rail';
import { useT } from '@/lib/i18n';
import { Icon } from '@/ui/Icon';

export type AppView = 'home' | 'update' | 'alerts' | 'uptime' | 'history' | 'stacks' | 'settings';

const NAV: { id: AppView; icon: string }[] = [
  { id: 'home', icon: 'home' },
  { id: 'update', icon: 'system_update_alt' },
  { id: 'alerts', icon: 'notifications' },
  { id: 'uptime', icon: 'monitor_heart' },
  { id: 'history', icon: 'history' },
  { id: 'stacks', icon: 'deployed_code' },
  { id: 'settings', icon: 'settings' },
];
const PRIMARY_MOBILE: AppView[] = ['home', 'update', 'alerts', 'uptime'];
const SECONDARY_MOBILE: AppView[] = ['history', 'stacks', 'settings'];

export function AppNavItems({ view, onPick, alertCount, grouped = false }: {
  view: AppView;
  onPick: (view: AppView) => void;
  alertCount: number;
  grouped?: boolean;
}) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!grouped) {
    return (
      <>
        {PRIMARY_MOBILE.map(id => {
          const item = NAV.find(nav => nav.id === id)!;
          const selected = view === id;
          return (
            <M3eNavItem key={id} selected={selected} aria-current={selected ? 'page' : undefined} onClick={() => onPick(id)}>
              <span slot="icon" className="relative inline-flex">
                <Icon name={item.icon} />
                {id === 'alerts' && alertCount > 0 && <M3eBadge className="absolute -right-2 -top-1">{alertCount > 99 ? '99+' : alertCount}</M3eBadge>}
              </span>
              <span slot="selected-icon"><Icon name={item.icon} fill /></span>
              {t(`nav.${id}` as const)}
            </M3eNavItem>
          );
        })}
        <M3eNavItem selected={SECONDARY_MOBILE.includes(view)} aria-current={SECONDARY_MOBILE.includes(view) ? 'page' : undefined} onClick={() => setMoreOpen(true)}>
          <span slot="icon"><Icon name="more_horiz" /></span>
          <span slot="selected-icon"><Icon name="more_horiz" fill /></span>
          {t('nav.more')}
        </M3eNavItem>
        <M3eBottomSheet open={moreOpen} modal handle hideable detents={['fit', 'full']} detent={0}
          handleLabel={t('nav.more')} onClosed={() => setMoreOpen(false)}>
          <span slot="header" className="t-title-m">{t('nav.more')}</span>
          <M3eActionList>
            {SECONDARY_MOBILE.map(id => {
              const item = NAV.find(nav => nav.id === id)!;
              return (
                <M3eListAction key={id} onClick={() => { setMoreOpen(false); onPick(id); }}>
                  <Icon slot="leading" name={item.icon} />{t(`nav.${id}` as const)}
                </M3eListAction>
              );
            })}
          </M3eActionList>
        </M3eBottomSheet>
      </>
    );
  }
  return (
    <>
      <span className="nav-rail-section-label">{t('nav.workspace')}</span>
      {NAV.map((item, index) => {
        const hasAlerts = item.id === 'alerts' && alertCount > 0;
        const icon = (fill: boolean, slot: string) => (
          <span slot={slot} className="relative inline-flex">
            <Icon name={item.icon} fill={fill} />
            {hasAlerts && !grouped && <M3eBadge className="absolute -right-2 -top-1">{alertCount > 99 ? '99+' : alertCount}</M3eBadge>}
          </span>
        );
        return (
          <Fragment key={item.id}>
            {index === 5 && <span className="nav-rail-section-label nav-rail-section-label-spaced">{t('nav.manage')}</span>}
            <M3eNavItem selected={view === item.id} aria-current={view === item.id ? 'page' : undefined} onClick={() => onPick(item.id)}>
              {icon(false, 'icon')}
              {icon(true, 'selected-icon')}
              <span className="selfdock-nav-item-label">
                {t(`nav.${item.id}` as const)}
                {hasAlerts && (
                  <M3eBadge className="selfdock-nav-alert-count">{alertCount > 99 ? '99+' : alertCount}</M3eBadge>
                )}
              </span>
            </M3eNavItem>
          </Fragment>
        );
      })}
    </>
  );
}

export function AppSidebar({ view, onPick, alertCount, onAddService }: {
  view: AppView;
  onPick: (view: AppView) => void;
  alertCount: number;
  onAddService: () => void;
}) {
  const t = useT();
  return (
    <M3eNavRail mode="expanded" aria-label={t('nav.aria')} className="selfdock-nav-rail fixed inset-y-3 left-3 z-20 hidden md:flex">
      <div className="nav-rail-brand">
        <img src="/floria-dock.png" alt="" className="nav-rail-brand-icon" />
        <span className="nav-rail-brand-name">Floria <span>SelfDock</span></span>
      </div>
      <M3eFab extended variant="primary-container" size="small" aria-label={t('add.title')} title={t('add.title')} onClick={onAddService}>
        <Icon name="add" />
        <span slot="label">{t('add.title')}</span>
      </M3eFab>
      <AppNavItems view={view} onPick={onPick} alertCount={alertCount} grouped />
    </M3eNavRail>
  );
}
