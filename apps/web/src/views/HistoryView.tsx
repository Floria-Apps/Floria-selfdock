import { useMemo, useState } from 'react';
import { M3eCard } from '@m3e/react/card';
import { M3eHeading } from '@m3e/react/heading';
import { M3eAccordion, M3eExpansionPanel } from '@m3e/react/expansion-panel';
import { M3eList, M3eListItem } from '@m3e/react/list';
import type { Incident } from '@shared/types';
import { causeText } from '@/lib/describe';
import { clock, dayLabel, duration } from '@/lib/format';
import { trn, useT, type Key } from '@/lib/i18n';
import { useHistoryData } from '@/lib/useHistoryData';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';
import { Btn, Tabs } from '@/ui/controls';

type IncidentFilter = 'all' | 'active' | 'planned' | 'resolved';
const KINDS = ['offline', 'unhealthy', 'restarting', 'paused', 'starting'];

function IncidentRow({ incident, now }: { incident: Incident; now: number }) {
  const t = useT();
  const open = incident.endedAt === null;
  const kind = KINDS.includes(incident.kind) ? incident.kind : 'default';
  const title = incident.planned
    ? t('history.youStopped', { name: incident.serviceName })
    : t(`history.kind.${kind}` as Key, { name: incident.serviceName });
  const when = open
    ? t('history.since.open', { from: clock(incident.startedAt) })
    : t('history.range', { from: clock(incident.startedAt), to: clock(incident.endedAt!), dur: duration(incident.endedAt! - incident.startedAt) });
  const tail = open ? ` · ${t(incident.planned ? 'history.stillStopped' : 'history.stillDown')}` : '';
  const elapsed = open && !incident.planned ? ` · ${t('history.stillDownDuration', { dur: duration(now - incident.startedAt) })}` : '';
  const cause = !incident.planned ? causeText(incident.cause) : null;
  return (
    <M3eListItem>
      <span slot="leading" className={`flex h-10 w-10 items-center justify-center rounded-full ${
        incident.planned ? 'bg-secondary-container text-on-secondary-container' : open ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container'}`}>
        <Icon name={incident.planned ? 'stop_circle' : open ? 'error' : 'history'} fill />
      </span>
      {title}
      <span slot="supporting-text" className="line-clamp-2">{when}{tail}{elapsed}{cause ? ` · ${cause}` : ''}</span>
    </M3eListItem>
  );
}

export function HistoryView() {
  const t = useT();
  const { data, error, now, retry } = useHistoryData();
  const [filter, setFilter] = useState<IncidentFilter>('all');

  const groups = useMemo(() => {
    const grouped = new Map<string, Incident[]>();
    const incidents = (data?.incidents ?? []).filter(incident => {
      if (filter === 'active') return incident.endedAt === null && !incident.planned;
      if (filter === 'planned') return incident.planned;
      if (filter === 'resolved') return incident.endedAt !== null && !incident.planned;
      return true;
    });
    for (const incident of incidents) {
      const day = dayLabel(incident.startedAt);
      const dayIncidents = grouped.get(day);
      if (dayIncidents) dayIncidents.push(incident);
      else grouped.set(day, [incident]);
    }
    return [...grouped.entries()];
  }, [data, filter]);

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

  const overview = [
    {
      label: t('history.activeIncidents'),
      value: data.incidents.filter(incident => incident.endedAt === null && !incident.planned).length,
      color: 'var(--error)',
    },
    {
      label: t('history.filterResolved'),
      value: data.incidents.filter(incident => incident.endedAt !== null && !incident.planned).length,
      color: 'var(--success)',
    },
    {
      label: t('history.filterPlanned'),
      value: data.incidents.filter(incident => incident.planned).length,
      color: 'var(--warning)',
    },
  ];

  return (
    <div className="page-content page-content--wide">
      {error && <M3eCard variant="filled" className="block border border-error-container" role="alert">
        <div className="flex flex-wrap items-center gap-3"><Icon name="error" fill className="text-error" /><p className="t-body-m min-w-0 flex-1">{error}</p><Btn variant="tonal" icon="refresh" onClick={retry}>{t('common.retry')}</Btn></div>
      </M3eCard>}
      <section aria-labelledby="h-inc" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <M3eHeading id="h-inc" variant="headline" size="small" level={2} className="block">
            {t('history.events')}
          </M3eHeading>
          <span className="t-label-m text-on-surface-variant">{trn('history.eventCount', data.incidents.length)}</span>
        </div>
        {data.incidents.length > 0 && (
          <M3eCard variant="filled" className="block">
            <div className="grid gap-2 p-2 sm:grid-cols-3 sm:gap-0">
              {overview.map((stat, index) => (
                <div key={stat.label} className={`history-summary-stat ${index > 0 ? 'sm:border-l sm:border-outline-variant' : ''}`}>
                  <span className="history-summary-mark" style={{ backgroundColor: stat.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="t-body-s block truncate text-on-surface-variant">{stat.label}</span>
                    <span className="t-title-m block tabular-nums">{stat.value}</span>
                  </span>
                </div>
              ))}
            </div>
          </M3eCard>
        )}
        {data.incidents.length > 0 && (
          <div className="overflow-x-auto pb-1">
            <Tabs
              value={filter}
              onChange={setFilter}
              label={t('history.filterLabel')}
              tabs={[
                { v: 'all', label: t('history.filterAll') },
                { v: 'active', label: t('history.filterActive') },
                { v: 'planned', label: t('history.filterPlanned') },
                { v: 'resolved', label: t('history.filterResolved') },
              ]}
            />
          </div>
        )}
        {groups.length === 0 ? (
          <M3eCard variant="filled" className="block">
            <div className="flex flex-col items-center gap-3 p-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="verified" fill /></span>
              <p className="t-title-m">{data.incidents.length ? t('history.filterEmpty') : t('history.noEvents')}</p>
              <p className="t-body-m max-w-sm text-on-surface-variant">{data.incidents.length ? t('history.filterEmptyText') : t('history.noEventsText')}</p>
            </div>
          </M3eCard>
        ) : (
          <M3eAccordion>
            {groups.map(([day, items], index) => (
              <M3eExpansionPanel key={day} open={index === 0}>
                <span slot="header" className="flex w-full items-center justify-between gap-3">
                  <span className="capitalize">{day}</span>
                  <span className="t-label-m text-on-surface-variant">{trn('history.eventCount', items.length)}</span>
                </span>
                <M3eList variant="segmented" className="pb-2">
                  {items.map(incident => <IncidentRow key={incident.id} incident={incident} now={now} />)}
                </M3eList>
              </M3eExpansionPanel>
            ))}
          </M3eAccordion>
        )}
      </section>
    </div>
  );
}
