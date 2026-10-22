import { useEffect, useState } from 'react';
import { M3eAvatar } from '@m3e/react/avatar';
import { M3eBadge } from '@m3e/react/badge';
import { M3eFab } from '@m3e/react/fab';
import { M3eNavBar, M3eNavItem } from '@m3e/react/nav-bar';
import { M3eNavRail } from '@m3e/react/nav-rail';
import { M3eSearchBar } from '@m3e/react/search';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { startLive, stopLive } from '@/lib/live';
import { usePrefs, useStore } from '@/lib/store';
import { useApplyTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui';
import { Btn, IconButton } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';
import { Overlays } from '@/components/Overlays';
import { AlertsView } from '@/views/AlertsView';
import { AuthView } from '@/views/AuthView';
import { HistoryView } from '@/views/HistoryView';
import { HomeView } from '@/views/HomeView';
import { SettingsView } from '@/views/SettingsView';
import { StacksView } from '@/views/StacksView';

type View = 'home' | 'alerts' | 'history' | 'stacks' | 'settings';
const NAV: { id: View; icon: string }[] = [
  { id: 'home', icon: 'home' },
  { id: 'alerts', icon: 'notifications' },
  { id: 'history', icon: 'history' },
  { id: 'stacks', icon: 'deployed_code' },
  { id: 'settings', icon: 'settings' },
];

/** The navigation items, shared by the side rail (desktop) and the bottom bar (phones). */
function NavItems({ view, onPick, alertCount }: { view: View; onPick: (v: View) => void; alertCount: number }) {
  const t = useT();
  return (
    <>
      {NAV.map(n => {
        const badge = n.id === 'alerts' && alertCount > 0;
        /* The badge sits in the icon's own box, so it always lands on the icon's corner. */
        const icon = (fill: boolean, slot: string) => (
          <span slot={slot} className="relative inline-flex">
            <Icon name={n.icon} fill={fill} />
            {badge && <M3eBadge className="absolute -right-2 -top-1">{alertCount}</M3eBadge>}
          </span>
        );
        return (
          <M3eNavItem key={n.id} selected={view === n.id} onClick={() => onPick(n.id)}>
            {icon(false, 'icon')}
            {icon(true, 'selected-icon')}
            {t(`nav.${n.id}` as const)}
          </M3eNavItem>
        );
      })}
    </>
  );
}

export default function App() {
  const t = useT();
  const auth = useStore(s => s.auth);
  const username = useStore(s => s.username);
  const alertCount = useStore(s => s.alerts.length);
  const conn = useStore(s => s.conn);
  const setAuth = useStore(s => s.setAuth);
  const prefs = usePrefs();
  const setUi = useUi(s => s.set);
  const dark = useApplyTheme();
  const [view, setView] = useState<View>('home');
  const [query, setQuery] = useState('');
  const [bootError, setBootError] = useState('');

  const boot = () => {
    setBootError('');
    api.authState()
      .then(st => { useStore.setState({ demo: st.demo }); setAuth(st.setupRequired ? 'setup' : st.user ? 'ready' : 'login', st.user?.username ?? null); })
      .catch(e => setBootError(e instanceof Error ? e.message : t('err.generic')));
  };
  useEffect(boot, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (auth === 'ready') startLive(); else stopLive();
    return () => stopLive();
  }, [auth]);

  const logout = () => { void api.logout().finally(() => { stopLive(); setAuth('login', null); setView('home'); }); };

  if (bootError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-error-container text-on-error-container"><Icon name="cloud_off" size={32} /></span>
        <h1 className="t-headline-s">{t('boot.errorTitle')}</h1>
        <p className="t-body-m max-w-sm text-on-surface-variant">{bootError}</p>
        <Btn variant="filled" icon="refresh" onClick={boot}>{t('common.retry')}</Btn>
      </main>
    );
  }
  if (auth === 'loading') return <main className="flex min-h-screen items-center justify-center"><Loading /></main>;
  if (auth === 'setup' || auth === 'login') return <><AuthView setup={auth === 'setup'} /><Overlays /></>;

  return (
    <div className="min-h-screen md:pl-20">
      {/* side rail on desktop */}
      <M3eNavRail aria-label={t('nav.home')} className="fixed inset-y-0 left-0 z-20 hidden md:flex">
        <M3eFab variant="primary-container" size="small" aria-label={t('add.title')} title={t('add.title')} onClick={() => setUi({ adding: true })}>
          <Icon name="add" />
        </M3eFab>
        <NavItems view={view} onPick={setView} alertCount={alertCount} />
      </M3eNavRail>

      <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-4 md:px-8 md:pb-16">
        <header className="mb-6 flex items-center gap-3">
          {view === 'home' ? (
            <M3eSearchBar clearable clearLabel={t('search.clear')} className="min-w-0 flex-1 md:max-w-xl md:flex-none md:basis-[36rem]" onClear={() => setQuery('')}>
              <Icon slot="leading" name="search" />
              <input slot="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
            </M3eSearchBar>
          ) : <h1 className="t-title-l flex h-14 items-center px-1">{t(`nav.${view}` as const)}</h1>}
          <div className="ml-auto flex items-center gap-2">
            <IconButton icon={dark ? 'light_mode' : 'dark_mode'} label={dark ? t('theme.toLight') : t('theme.toDark')} onClick={() => prefs.set({ theme: dark ? 'light' : 'dark' })} />
            <M3eAvatar title={username ?? ''} aria-label={t('account.label', { name: username ?? '' })}><Icon name="person" fill /></M3eAvatar>
          </div>
        </header>

        {conn !== 'open' && (
          <div role="status" className="t-body-m mb-4 flex items-center gap-3 rounded-2xl bg-tertiary-container px-4 py-3 text-on-tertiary-container">
            <Icon name="sync" /> {t('conn.reconnecting')}
          </div>
        )}

        {view === 'home' && <HomeView query={query} go={setView} />}
        {view === 'alerts' && <AlertsView go={setView} />}
        {view === 'history' && <HistoryView />}
        {view === 'stacks' && <StacksView />}
        {view === 'settings' && <SettingsView onLogout={logout} />}
      </main>

      {/* bottom bar on phones */}
      <M3eNavBar aria-label={t('nav.home')} className="fixed inset-x-0 bottom-0 z-20 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <NavItems view={view} onPick={setView} alertCount={alertCount} />
      </M3eNavBar>

      {view === 'home' && (
        <M3eFab extended variant="primary-container" className="fixed right-4 z-30 md:hidden" style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
          onClick={() => setUi({ adding: true })}>
          <Icon name="add" /><span slot="label">{t('add.title')}</span>
        </M3eFab>
      )}

      <Overlays />
    </div>
  );
}
