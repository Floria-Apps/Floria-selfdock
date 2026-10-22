import { M3eCard } from '@m3e/react/card';
import { M3eList, M3eListItem } from '@m3e/react/list';
import { M3eLinearProgressIndicator } from '@m3e/react/progress-indicator';
import type { Service } from '@shared/types';
import { IconButton } from '@/ui/controls';
import { AppIcon } from './AppIcon';
import { StatusChip } from './StatusChip';
import { STATUS_COLORS, statusLabel, isBusy } from '@/lib/status';
import { openApp } from '@/lib/actions';
import { describeService } from '@/lib/describe';
import { useT } from '@/lib/i18n';
import { useUi } from '@/lib/ui';

interface Props { service: Service; showPort: boolean; logos: boolean }

function MoreButton({ service, className = '' }: { service: Service; className?: string }) {
  const t = useT();
  const openMenu = useUi(s => s.openMenu);
  return <IconButton icon="more_vert" label={t('menu.more', { name: service.name })} className={className}
    onClick={e => { e.stopPropagation(); openMenu(service.id, e.currentTarget as HTMLElement); }} />;
}

export function AppCard({ service, showPort, logos }: Props) {
  useT();
  const off = service.status === 'offline';
  return (
    <div className="relative h-full">
      <M3eCard variant="filled" actionable className="block h-full" onClick={() => openApp(service)}>
        <div className="flex h-full flex-col gap-3 text-left">
          <AppIcon service={service} size={48} radius={16} logos={logos} />
          <span className="block min-w-0">
            <span className={`t-title-m block truncate ${off ? 'text-on-surface-variant' : ''}`}>{service.name}</span>
            <span className="t-body-m line-clamp-2 block text-on-surface-variant">{describeService(service)}</span>
          </span>
          <span className="mt-auto flex items-center justify-between gap-2 pt-1">
            <StatusChip status={service.status} />
            {showPort && service.port && <span className="t-label-m text-on-surface-variant">:{service.port}</span>}
          </span>
        </div>
      </M3eCard>
      {isBusy(service.status) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden rounded-b-2xl"><M3eLinearProgressIndicator mode="indeterminate" /></div>
      )}
      <MoreButton service={service} className="absolute right-2 top-2" />
    </div>
  );
}

export function AppRow({ service, showPort, logos }: Props) {
  useT();
  const off = service.status === 'offline';
  return (
    <M3eListItem className="cursor-pointer" role="button" tabIndex={0} onClick={() => openApp(service)}
      onKeyDown={e => {
        // Only for keys pressed on the row itself, not on the ⋮ button inside it
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openApp(service); }
      }}>
      <span slot="leading"><AppIcon service={service} size={40} radius={20} logos={logos} /></span>
      <span className={off ? 'text-on-surface-variant' : ''}>{service.name}</span>
      <span slot="supporting-text">{describeService(service)}</span>
      <div slot="trailing" className="flex items-center gap-2">
        <span className="hidden sm:inline-flex"><StatusChip status={service.status} /></span>
        {showPort && service.port && <span className="t-label-m hidden w-12 text-right text-on-surface-variant sm:block">:{service.port}</span>}
        <span className="h-2.5 w-2.5 shrink-0 rounded-full sm:hidden" style={{ background: STATUS_COLORS[service.status].dot }} aria-label={statusLabel(service.status)} />
        <MoreButton service={service} />
      </div>
    </M3eListItem>
  );
}

/** One category as a Material 3 segmented list. */
export function AppRowList({ services, showPort, logos }: { services: Service[]; showPort: boolean; logos: boolean }) {
  return <M3eList variant="segmented">{services.map(s => <AppRow key={s.id} service={s} showPort={showPort} logos={logos} />)}</M3eList>;
}
