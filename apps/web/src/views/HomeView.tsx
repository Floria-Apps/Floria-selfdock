import { useMemo, useState } from 'react';
import type { Alert, Service } from '@shared/types';
import { M3eExpansionPanel } from '@m3e/react/expansion-panel';
import { api } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { CATEGORIES, catName } from '@/lib/categories';
import { describeService } from '@/lib/describe';
import { bytes } from '@/lib/format';
import { useT, type Key } from '@/lib/i18n';
import { useStore, usePrefs } from '@/lib/store';
import { useUi } from '@/lib/ui';
import { Btn, ChipSelect, Segmented } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { AppCard, AppRowList } from '@/components/AppItems';
import { Gauge } from '@/components/Gauge';
import { Hero } from '@/components/Hero';

export function useAlertActions(go: (v: 'history') => void) {
  const t = useT();
  const set = useUi(s => s.set);
  const say = useStore(s => s.say);
  return {
    dismiss: async (id: string) => { try { await api.dismiss(id); say(t('alerts.dismissed'), 'success'); } catch (e) { say(errorText(e), 'error'); } },
    act: (a: Alert) => {
      if (a.action?.kind === 'logs' && a.action.serviceId) set({ logs: a.action.serviceId });
      else if (a.action?.kind === 'history') go('history');
    },
  };
}

function DockerBanner({ code, detail }: { code?: string; detail?: string }) {
  const t = useT();
  return (
    <section className="mb-4 flex items-start gap-4 rounded-2xl bg-error-container p-4 text-on-error-container" role="alert">
      <Icon name="sailing" fill />
      <div className="min-w-0">
        <h2 className="t-title-m">{t('docker.title')}</h2>
        <p className="t-body-m mt-1">{t(`docker.${code ?? 'other'}` as Key, { detail: detail ?? '' })}</p>
        <p className="t-body-s mt-1">{t('docker.hint')}</p>
      </div>
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <section className="rounded-[28px] bg-secondary-container p-8 text-on-secondary-container">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary"><Icon name="deployed_code" fill /></span>
      <h1 className="t-headline-s mt-4">{t('empty.title')}</h1>
      <p className="t-body-l mt-2 max-w-xl">{t('empty.text')}</p>
      <div className="mt-5"><Btn variant="filled" icon="add" onClick={onAdd}>{t('empty.add')}</Btn></div>
    </section>
  );
}

export function HomeView({ query, go }: { query: string; go: (v: 'alerts' | 'history') => void }) {
  const t = useT();
  const servicesMap = useStore(s => s.services);
  const alerts = useStore(s => s.alerts);
  const metrics = useStore(s => s.metrics);
  const docker = useStore(s => s.docker);
  const prefs = usePrefs();
  const set = useUi(s => s.set);
  const [cat, setCat] = useState('all');

  const all = useMemo(() => Object.values(servicesMap).filter(s => prefs.showHidden || !s.hidden), [servicesMap, prefs.showHidden]);
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const match = (s: Service) => (cat === 'all' || s.category === cat) && (!q || `${s.name} ${describeService(s)}`.toLowerCase().includes(q));
    return CATEGORIES.map(c => ({ c, items: all.filter(s => s.category === c.id && match(s)).sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter(g => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, cat, q, prefs.lang]);
  const usedCats = useMemo(() => new Set(all.map(s => s.category)), [all]);
  return (
    <>
      {!docker.ok && <DockerBanner code={docker.code} detail={docker.detail} />}
      {all.length === 0 ? <EmptyState onAdd={() => set({ adding: true })} /> : (
        <Hero services={all} alertCount={alerts.length} onGoAlerts={() => go('alerts')} />
      )}

      {prefs.showServer && metrics && (
        <M3eExpansionPanel className="home-server-panel">
          <span slot="header" className="flex w-full min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-tertiary-container text-on-tertiary-container">
              <Icon name="dns" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-title-m flex flex-wrap items-center gap-x-2 gap-y-1">
                {t('server.title')}
                {(metrics.disk.percent >= 85 || metrics.ram.percent >= 92 || metrics.cpu >= 90) && (
                  <span className="t-label-m rounded-full bg-warning-container px-3 py-1 text-on-warning-container">{t('server.attention')}</span>
                )}
              </span>
              <span className="t-body-s block text-on-surface-variant">{t('server.expandHint')}</span>
            </span>
          </span>
          <div className="grid grid-cols-1 gap-3 px-1 pb-2 sm:grid-cols-3">
            <Gauge label={t('server.disk')} sub={t('server.free', { size: bytes(metrics.disk.total - metrics.disk.used) })} value={metrics.disk.percent} warn={metrics.disk.percent >= 85} />
            <Gauge label={t('server.memory')} sub={t('server.memoryOf', { size: bytes(metrics.ram.total) })} value={metrics.ram.percent} warn={metrics.ram.percent >= 92} />
            <Gauge label={t('server.cpu')} sub={t('server.now')} value={metrics.cpu} warn={metrics.cpu >= 90} />
          </div>
        </M3eExpansionPanel>
      )}

      {all.length > 0 && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <ChipSelect label={t('filter.aria')} value={cat} onChange={setCat}
              options={[{ v: 'all', label: t('category.all') }, ...CATEGORIES.filter(c => usedCats.has(c.id)).map(c => ({ v: c.id, label: catName(c.id) }))]} />
          </div>
          <Segmented value={prefs.layout} onChange={v => prefs.set({ layout: v })} options={[
            { v: 'grid', icon: 'grid_view', iconOnly: true, aria: t('layout.grid') },
            { v: 'list', icon: 'view_list', iconOnly: true, aria: t('layout.list') },
          ]} />
        </div>
      )}

      {groups.map(g => (
        <section key={g.c.id} className="mt-5" aria-labelledby={`h-${g.c.id}`}>
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3 px-1">
            <h2 id={`h-${g.c.id}`} className="t-title-m min-w-0 truncate">{catName(g.c.id)}</h2>
            <span className="t-label-m shrink-0 text-on-surface-variant">{g.items.length}</span>
          </div>
          {prefs.layout === 'grid' ? (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {g.items.map(s => <AppCard key={s.id} service={s} showPort={prefs.showPort} logos={prefs.showLogos} />)}
            </div>
          ) : (
            <AppRowList services={g.items} showPort={prefs.showPort} logos={prefs.showLogos} />
          )}
        </section>
      ))}

      {all.length > 0 && groups.length === 0 && (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sc-high text-on-surface-variant"><Icon name="search_off" size={32} /></span>
          <p className="t-title-m">{t('search.noneTitle')}</p>
          <p className="t-body-m max-w-xs text-on-surface-variant">{t('search.noneText')}</p>
        </div>
      )}
    </>
  );
}
