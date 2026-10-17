import { useEffect, useMemo, useState } from 'react';
import { M3eList, M3eListItem } from '@m3e/react/list';
import type { Incident } from '@shared/types';
import { api, type HistoryData } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { causeText } from '@/lib/describe';
import { clock, dateOnly, dayLabel, duration, pct } from '@/lib/format';
import { trn, useT, type Key } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';
import { AppIcon } from '@/components/AppIcon';

const availTone = (v: number) => (v >= 99.9 ? 'var(--success)' : v >= 98 ? 'var(--warning)' : 'var(--error)');
const KINDS = ['offline', 'unhealthy', 'restarting', 'paused', 'starting'];

function IncidentRow({ i }: { i: Incident }) {
  const t = useT();
  const open = i.endedAt === null;
  const kind = KINDS.includes(i.kind) ? i.kind : 'default';
  const title = i.planned ? t('history.youStopped', { name: i.serviceName }) : t(`history.kind.${kind}` as Key, { name: i.serviceName });
  const when = open ? t('history.since.open', { from: clock(i.startedAt) })
    : t('history.range', { from: clock(i.startedAt), to: clock(i.endedAt!), dur: duration(i.endedAt! - i.startedAt) });
  const tail = open ? ` ${t(i.planned ? 'history.stillStopped' : 'history.stillDown')}` : '';
  const cause = !i.planned ? causeText(i.cause) : null;
  return (
    <M3eListItem>
      <span slot="leading" className={`flex h-10 w-10 items-center justify-center rounded-full ${
        i.planned ? 'bg-secondary-container text-on-secondary-container' : open ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container'}`}>
        <Icon name={i.planned ? 'stop_circle' : open ? 'error' : 'history'} fill />
      </span>
      {title}
      <span slot="supporting-text">{when}{tail}{cause ? ` · ${cause}` : ''}</span>
    </M3eListItem>
  );
}

export function HistoryView() {
  const t = useT();
  const version = useStore(s => s.historyVersion);
  const services = useStore(s => s.services);
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api.history().then(d => { if (alive) { setData(d); setError(''); } }).catch(e => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [version]);

  const groups = useMemo(() => {
    const m = new Map<string, Incident[]>();
    for (const i of data?.incidents ?? []) { const k = dayLabel(i.startedAt); m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m.entries()];
  }, [data]);
  const avail = useMemo(() => [...(data?.availability ?? [])].sort((a, b) => a.last7d - b.last7d || a.name.localeCompare(b.name)), [data]);

  if (error) return <p className="t-body-m flex items-center gap-2 text-error"><Icon name="error" size={18} />{error}</p>;
  if (!data) return <Loading />;

  const recent = Date.now() - data.trackedSince < 7 * 24 * 3600 * 1000;

  return (
    <div className="grid max-w-3xl gap-8">
      <section aria-labelledby="h-av">
        <h2 id="h-av" className="t-title-m mb-1 px-1">{t('history.availability')}</h2>
        <p className="t-body-s mb-3 px-1 text-on-surface-variant">
          {t('history.availabilityHelp')}{' '}
          {recent ? `${t('history.since', { date: dateOnly(data.trackedSince), time: clock(data.trackedSince) })} ` : ''}
          {t('history.plannedNote')}
        </p>
        {avail.length === 0 ? <p className="t-body-m px-1 text-on-surface-variant">{t('history.noApps')}</p> : (
          <M3eList variant="segmented">
            {avail.map(a => {
              const s = services[a.serviceId];
              return (
                <M3eListItem key={a.serviceId}>
                  <span slot="leading">{s ? <AppIcon service={s} size={40} radius={20} /> : <span className="block h-10 w-10 rounded-full bg-sc-highest" />}</span>
                  {a.name}
                  <span slot="supporting-text">{a.incidents7d === 0 ? t('history.none7d') : trn('history.incidents7d', a.incidents7d)}</span>
                  <div slot="trailing" className="flex items-center gap-4 text-right">
                    <div><p className="t-title-m" style={{ color: availTone(a.last24h) }}>{pct(a.last24h)}</p><p className="t-body-s text-on-surface-variant">{t('history.h24')}</p></div>
                    <div className="w-14"><p className="t-title-m" style={{ color: availTone(a.last7d) }}>{pct(a.last7d)}</p><p className="t-body-s text-on-surface-variant">{t('history.d7')}</p></div>
                  </div>
                </M3eListItem>
              );
            })}
          </M3eList>
        )}
      </section>

      <section aria-labelledby="h-inc">
        <h2 id="h-inc" className="t-title-m mb-3 px-1">{t('history.events')}</h2>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-sc-low p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="verified" fill /></span>
            <p className="t-title-m">{t('history.noEvents')}</p>
            <p className="t-body-m max-w-sm text-on-surface-variant">{t('history.noEventsText')}</p>
          </div>
        ) : groups.map(([day, items]) => (
          <div key={day} className="mb-4">
            <h3 className="t-label-l mb-2 px-1 capitalize text-on-surface-variant">{day}</h3>
            <M3eList variant="segmented">{items.map(i => <IncidentRow key={i.id} i={i} />)}</M3eList>
          </div>
        ))}
      </section>
    </div>
  );
}
