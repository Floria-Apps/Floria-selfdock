import { lazy, Suspense, useEffect, useState } from 'react';
import { M3eAvatar } from '@m3e/react/avatar';
import { M3eAppBar } from '@m3e/react/app-bar';
import { M3eCard } from '@m3e/react/card';
import { M3eFab } from '@m3e/react/fab';
import { M3eNavBar } from '@m3e/react/nav-bar';
import { M3eSearchBar } from '@m3e/react/search';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { startLive, stopLive } from '@/lib/live';
import { usePrefs, useStore } from '@/lib/store';
import { useApplyTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui';
import { AppNavItems, AppSidebar, type AppView } from '@/components/AppNavigation';
import { Btn, IconButton } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';
import { Overlays } from '@/components/Overlays';

const AlertsView = lazy(() => import('@/views/AlertsView').then(m => ({ default: m.AlertsView })));
const AuthView = lazy(() => import('@/views/AuthView').then(m => ({ default: m.AuthView })));
const HistoryView = lazy(() => import('@/views/HistoryView').then(m => ({ default: m.HistoryView })));
const UptimeView = lazy(() => import('@/views/UptimeView').then(m => ({ default: m.UptimeView })));
const HomeView = lazy(() => import('@/views/HomeView').then(m => ({ default: m.HomeView })));
const SettingsView = lazy(() => import('@/views/SettingsView').then(m => ({ default: m.SettingsView })));
const StacksView = lazy(() => import('@/views/StacksView').then(m => ({ default: m.StacksView })));

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
  const [view, setView] = useState<AppView>('home');
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
        <M3eCard variant="filled" className="block w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 p-2 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-error-container text-on-error-container"><Icon name="cloud_off" size={32} /></span>
            <h1 className="t-headline-s">{t('boot.errorTitle')}</h1>
            <p className="t-body-m text-on-surface-variant">{bootError}</p>
            <Btn variant="filled" icon="refresh" onClick={boot}>{t('common.retry')}</Btn>
          </div>
        </M3eCard>
      </main>
    );
  }
  if (auth === 'loading') return <main className="flex min-h-screen items-center justify-center"><Loading /></main>;
  if (auth === 'setup' || auth === 'login') {
    return <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><Loading /></main>}>
      <AuthView setup={auth === 'setup'} />
      <Overlays />
    </Suspense>;
  }

  return (
    <div className="min-h-screen md:pl-72">
      {/* side rail on desktop */}
      <AppSidebar view={view} onPick={setView} alertCount={alertCount} onAddService={() => setUi({ adding: true })} />

      <main className="mx-auto w-full max-w-6xl px-4 pb-36 pt-4 md:px-8 md:pb-16">
        <M3eAppBar size="small" aria-label={t('nav.aria')} className="mb-6 block">
          {view === 'home' ? (
            <M3eSearchBar slot="title" clearable clearLabel={t('search.clear')} className="block w-full min-w-0 md:max-w-xl" onClear={() => setQuery('')}>
              <Icon slot="leading" name="search" />
              <input slot="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
            </M3eSearchBar>
          ) : <h1 slot="title" className="t-title-l block truncate">{t(`nav.${view}` as const)}</h1>}
          <div slot="trailing" className="flex items-center gap-1">
            <IconButton variant="tonal" icon={dark ? 'light_mode' : 'dark_mode'} label={dark ? t('theme.toLight') : t('theme.toDark')} onClick={() => prefs.set({ theme: dark ? 'light' : 'dark' })} />
            <M3eAvatar title={username ?? ''} aria-label={t('account.label', { name: username ?? '' })}><Icon name="person" fill /></M3eAvatar>
          </div>
        </M3eAppBar>

        {conn !== 'open' && (
          <M3eCard variant="filled" className="mb-4 block" role="status">
            <div className="t-body-m flex items-center gap-3 text-on-surface-variant">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tertiary-container"><Icon name="sync" /></span>
              {t('conn.reconnecting')}
            </div>
          </M3eCard>
        )}

        <Suspense fallback={<Loading className="min-h-40 items-center" />}>
          {view === 'home' && <HomeView query={query} go={setView} />}
          {view === 'alerts' && <AlertsView go={setView} />}
          {view === 'uptime' && <UptimeView />}
          {view === 'history' && <HistoryView />}
          {view === 'stacks' && <StacksView />}
          {view === 'settings' && <SettingsView onLogout={logout} />}
        </Suspense>
      </main>

      {/* bottom bar on phones */}
      <M3eNavBar aria-label={t('nav.aria')} className="fixed inset-x-0 bottom-0 z-20 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <AppNavItems view={view} onPick={setView} alertCount={alertCount} />
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
