import { useMemo, useState } from 'react';
import { M3eCard } from '@m3e/react/card';
import { M3eHeading } from '@m3e/react/heading';
import { M3eSearchBar } from '@m3e/react/search';
import type { Incident, Service } from '@shared/types';
import { causeText } from '@/lib/describe';
import { Btn, ChipSelect } from '@/ui/controls';
import { AppIcon } from '@/components/AppIcon';
import { clock, dateOnly, duration, pct } from '@/lib/format';
import { trn, useT, type Key } from '@/lib/i18n';
import { useHistoryData } from '@/lib/useHistoryData';
import { useStore } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';

const availTone = (v: number) => (v >= 99.9 ? 'var(--success)' : v >= 98 ? 'var(--warning)' : 'var(--error)');
type TimelineStatus = 'up' | 'down' | 'planned' | 'untracked';
type UptimeFilter = 'all' | 'attention' | 'healthy';

function buildTimeline(incidents: Incident[], trackedSince: number, now: number) {
  const intervalMs = 4 * 60 * 60 * 1000;
  const windowStart = now - 7 * 24 * 60 * 60 * 1000;
  return Array.from({ length: 42 }, (_, index) => {
    const start = windowStart + index * intervalMs;
    const end = start + intervalMs;
    const overlap = incidents.filter(i => i.startedAt < end && (i.endedAt ?? now) > start);
    const status: TimelineStatus = overlap.some(i => !i.planned) ? 'down'
      : overlap.some(i => i.planned) ? 'planned'
        : start < trackedSince ? 'untracked'
          : 'up';
    return { start, status };
  });
}

function AvailabilityPanel({ item, service, incidents, trackedSince, now }: {
  item: {
    serviceId: string; name: string; last24h: number; last7d: number; incidents7d: number;
    downtime24hMs: number; downtime7dMs: number;
  };
  service?: Service;
  incidents: Incident[];
  trackedSince: number;
  now: number;
}) {
  const t = useT();
  const timeline = buildTimeline(incidents, trackedSince, now);
  const activeIncident = incidents.find(incident => incident.endedAt === null);
  const activeCause = activeIncident && !activeIncident.planned ? causeText(activeIncident.cause) : null;
  return (
    <M3eCard variant="filled" className="block uptime-service-card">
      <div className="flex min-w-0 flex-wrap items-center gap-3 p-3 sm:flex-nowrap sm:p-4">
        {service ? <AppIcon service={service} size={36} radius={13} /> : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-sc-highest text-on-surface-variant"><Icon name="deployed_code" /></span>
        )}
        <div className="min-w-0 flex-1">
          <p className="t-title-m truncate">{item.name}</p>
          <div className="uptime-timeline mt-1" role="group" aria-label={t('history.timelineLabel')}>
            <div className="history-uptime-strip">
              {timeline.map(({ start, status }) => (
                <span key={start} className={`history-uptime-segment history-uptime-segment--${status}`}
                  role="img" aria-label={`${dateOnly(start)} ${clock(start)}: ${t(`history.timeline.${status}` as Key)}`}
                  title={`${dateOnly(start)} ${clock(start)}: ${t(`history.timeline.${status}` as Key)} · ${t('uptime.timelineInterval')}`} />
              ))}
            </div>
            <div className="flex justify-between text-on-surface-variant">
              <span className="t-body-s">{t('uptime.timelineStart')}</span>
              <span className="t-body-s">{t('uptime.timelineEnd')}</span>
            </div>
          </div>
          <p className="t-body-s mt-1 text-on-surface-variant">
            {item.incidents7d > 0 ? trn('history.incidents7d', item.incidents7d) : t('history.none7d')}
          </p>
          {activeIncident && (
            <p className={`t-body-s mt-1 ${activeIncident.planned ? 'text-on-surface-variant' : 'text-error'}`}>
              {t(activeIncident.planned ? 'uptime.stoppedFor' : 'uptime.downFor', {
                date: dateOnly(activeIncident.startedAt),
                time: clock(activeIncident.startedAt),
                duration: duration(now - activeIncident.startedAt),
              })}
              {activeCause ? ` · ${activeCause}` : ''}
            </p>
          )}
        </div>
        <div className="grid w-full grid-cols-2 gap-3 border-t border-outline-variant pt-2 sm:w-auto sm:min-w-44 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div>
            <p className="t-label-m text-on-surface-variant">{t('uptime.availabilityPeriod', { period: t('history.h24') })}</p>
            <p className="t-title-m tabular-nums" style={{ color: availTone(item.last24h) }}>{pct(item.last24h)}</p>
            <p className="t-body-s text-on-surface-variant">{t('uptime.downtime', { duration: duration(item.downtime24hMs) })}</p>
          </div>
          <div>
            <p className="t-label-m text-on-surface-variant">{t('uptime.availabilityPeriod', { period: t('history.d7') })}</p>
            <p className="t-title-m tabular-nums" style={{ color: availTone(item.last7d) }}>{pct(item.last7d)}</p>
            <p className="t-body-s text-on-surface-variant">{t('uptime.downtime', { duration: duration(item.downtime7dMs) })}</p>
          </div>
        </div>
      </div>
    </M3eCard>
  );
}

export function UptimeView() {
  const t = useT();
  const services = useStore(s => s.services);
  const { data, error, retry, now } = useHistoryData();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UptimeFilter>('all');
  const openServiceIds = useMemo(
    () => new Set((data?.incidents ?? []).filter(i => i.endedAt === null && !i.planned).map(i => i.serviceId)),
    [data?.incidents],
  );
  const availability = useMemo(() => {
    if (!data) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return [...data.availability]
      .filter(item => {
        const needsAttention = item.last7d < 99.9 || item.incidents7d > 0;
        const matchesFilter = filter === 'all' || (filter === 'attention' ? needsAttention : !needsAttention);
        return matchesFilter && item.name.toLocaleLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) =>
        Number(openServiceIds.has(b.serviceId)) - Number(openServiceIds.has(a.serviceId))
        || a.last7d - b.last7d
        || b.incidents7d - a.incidents7d
        || a.name.localeCompare(b.name),
      );
  }, [data, filter, query, openServiceIds]);
  if (!data) {
    if (!error) return <div className="min-h-40"><Loading /></div>;
    return (
      <M3eCard variant="filled" className="block max-w-2xl border border-error-container" role="alert">
        <div className="flex flex-wrap items-center gap-3">
          <Icon name="error" fill className="text-error" />
          <p className="t-body-m min-w-0 flex-1">{error}</p>
          <Btn variant="tonal" icon="refresh" onClick={retry}>{t('common.retry')}</Btn>
        </div>
      </M3eCard>
    );
  }

  const recent = now - data.trackedSince < 7 * 24 * 60 * 60 * 1000;
  return (
    <div className="grid max-w-6xl gap-4">
      {error && <M3eCard variant="filled" className="block border border-error-container" role="alert">
        <div className="flex flex-wrap items-center gap-3"><Icon name="error" fill className="text-error" /><p className="t-body-m min-w-0 flex-1">{error}</p><Btn variant="tonal" icon="refresh" onClick={retry}>{t('common.retry')}</Btn></div>
      </M3eCard>}
      <section aria-labelledby="h-uptime" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <M3eHeading id="h-uptime" variant="headline" size="small" level={2} className="mb-1 block px-1">{t('history.availability')}</M3eHeading>
            <p className="t-body-s px-1 text-on-surface-variant">
              {t('uptime.summaryHelp')} {recent ? t('history.since', { date: dateOnly(data.trackedSince), time: clock(data.trackedSince) }) : ''}
            </p>
          </div>
          <span className="t-label-m px-1 text-on-surface-variant">
            {t('uptime.serviceCount', { count: availability.length, total: data.availability.length })}
          </span>
        </div>
        <div className="uptime-timeline-legend flex flex-wrap items-center gap-x-4 gap-y-2 px-1" aria-label={t('history.timelineLabel')}>
          <span className="t-body-s text-on-surface-variant">{t('uptime.timelineHelp')}</span>
          {([
            ['up', 'history.timeline.up'],
            ['down', 'history.timeline.down'],
            ['planned', 'history.timeline.planned'],
            ['untracked', 'history.timeline.untracked'],
          ] as const).map(([tone, label]) => (
            <span key={tone} className="inline-flex items-center gap-2 text-on-surface-variant">
              <span className={`history-uptime-segment history-uptime-segment--${tone}`} aria-hidden="true" />
              <span className="t-body-s">{t(label)}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="w-full min-w-0 sm:max-w-sm sm:flex-1">
            <M3eSearchBar clearable clearLabel={t('search.clear')} className="block w-full" onClear={() => setQuery('')}>
              <Icon slot="leading" name="search" />
              <input slot="input" type="search" value={query} onChange={event => setQuery(event.target.value)}
                placeholder={t('uptime.search')} aria-label={t('uptime.search')} />
            </M3eSearchBar>
          </div>
          <div className="max-w-full">
            <ChipSelect
              value={filter}
              onChange={setFilter}
              label={t('uptime.filterLabel')}
              options={[
                { v: 'all', label: t('uptime.filterAll') },
                { v: 'attention', label: t('uptime.filterAttention') },
                { v: 'healthy', label: t('uptime.filterHealthy') },
              ]}
            />
          </div>
        </div>
        {availability.length === 0 ? (
          <M3eCard variant="filled" className="block">
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="search_off" /></span>
              <p className="t-title-m">{data.availability.length ? t('uptime.noMatch') : t('history.noApps')}</p>
              {data.availability.length > 0 && <p className="t-body-s text-on-surface-variant">{t('uptime.noMatchHelp')}</p>}
            </div>
          </M3eCard>
        ) : (
          <div className="grid gap-2">
            {availability.map(item => (
              <AvailabilityPanel key={item.serviceId} item={item} service={services[item.serviceId]}
                incidents={data.incidents.filter(i => i.serviceId === item.serviceId)}
                trackedSince={data.trackedSince} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
