import { useMemo, useState } from 'react';
import { M3eSearchBar } from '@m3e/react/search';
import { M3eListItem } from '@m3e/react/list';
import { useStore } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { AppIcon } from '@/components/AppIcon';
import { describeService } from '@/lib/describe';
import { M3eSectionList } from '@/components/M3eWidgets';
import { ChipSelect } from '@/ui/controls';
import { trn, useT } from '@/lib/i18n';

type Filter = 'all' | 'outdated' | 'current';

export function UpdateView() {
  const t = useT();
  const servicesMap = useStore(s => s.services);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const dockerServices = useMemo(() => Object.values(servicesMap).filter(service => {
    if (service.source !== 'docker') return false;
    if (!`${service.name} ${service.image ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) return false;
    if (filter === 'outdated') return service.imageUpdateStatus === 'outdated';
    if (filter === 'current') return service.imageUpdateStatus === 'current';
    return true;
  }), [servicesMap, query, filter]);
  const allDocker = Object.values(servicesMap).filter(service => service.source === 'docker');
  const outdatedCount = allDocker.filter(service => service.imageUpdateStatus === 'outdated').length;
  const unknownCount = allDocker.filter(service => service.imageUpdateStatus === 'checking' || service.imageUpdateStatus === 'unknown').length;

  return (
    <div className="page-content page-content--wide">
      <div className="page-intro">
        <p className="t-body-m text-on-surface-variant">
          {outdatedCount ? trn('update.summary', outdatedCount) : t('update.summaryCurrent')}
          {unknownCount > 0 && <span className="ml-2">{t('update.summaryUnknown')} · {unknownCount}</span>}
        </p>
      </div>

      <div className="page-toolbar">
        <M3eSearchBar clearable clearLabel={t('search.clear')} className="block w-full sm:max-w-sm" onClear={() => setQuery('')}>
          <Icon slot="leading" name="search" />
          <input slot="input" type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder={t('update.search')} aria-label={t('update.search')} />
        </M3eSearchBar>
        <ChipSelect label={t('update.filter')} value={filter} onChange={setFilter} options={[
          { v: 'all', label: t('update.all') },
          { v: 'outdated', label: t('update.outdated') },
          { v: 'current', label: t('update.current') },
        ]} />
      </div>

      <M3eSectionList title={t('update.listTitle')} count={dockerServices.length}>
        {dockerServices.map(service => {
          const outdated = service.imageUpdateStatus === 'outdated';
          const known = service.imageUpdateStatus === 'current';
          return (
            <M3eListItem key={service.id} className="update-list-item">
              <span slot="leading"><AppIcon service={service} size={40} radius={14} logos /></span>
              <span className="update-image">{service.image || describeService(service)}</span>
              <span slot="supporting-text">{service.name}{service.port ? ` · :${service.port}` : ''}</span>
              <div slot="trailing" className="update-list-status">
                <span className={`update-state ${known ? 'update-state--current' : ''} ${outdated ? 'update-state--outdated' : ''}`}>
                  <Icon name={known ? 'check_circle' : outdated ? 'system_update_alt' : 'schedule'} size={18} />
                  <span className="t-label-m hidden sm:inline">
                    {t(known ? 'update.current' : outdated ? 'update.outdated' : 'update.unknown')}
                  </span>
                </span>
              </div>
            </M3eListItem>
          );
        })}
        {dockerServices.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon"><Icon name="search_off" size={24} /></span>
            <p className="t-title-m">{t('update.noneTitle')}</p>
            <p className="t-body-s text-on-surface-variant">{t('update.noneHelp')}</p>
          </div>
        )}
      </M3eSectionList>
    </div>
  );
}
