import { M3eCard } from '@m3e/react/card';
import { M3eList, M3eListItem } from '@m3e/react/list';
import { M3eLinearProgressIndicator } from '@m3e/react/progress-indicator';
import type { Service } from '@shared/types';
import { IconButton } from '@/ui/controls';
import { AppIcon } from './AppIcon';
import { Icon } from '@/ui/Icon';
import { StatusChip } from './StatusChip';
import { STATUS_COLORS, statusLabel, isBusy } from '@/lib/status';
import { appLocalUrl, errorText, isSafeHttpUrl, openApp } from '@/lib/actions';
import { describeService } from '@/lib/describe';
import { useT } from '@/lib/i18n';
import { useUi } from '@/lib/ui';
import { useStore } from '@/lib/store';

interface Props { service: Service; showPort: boolean; logos: boolean }

function UpdateBadge({ service }: { service: Service }) {
  const t = useT();
  if (service.imageUpdateStatus !== 'outdated') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-tertiary-container px-2 py-1 text-on-tertiary-container" title={t('updates.available')}>
      <Icon name="system_update_alt" size={16} />
      <span className="t-label-m">{t('updates.available')}</span>
    </span>
  );
}

function MoreButton({ service, className = '' }: { service: Service; className?: string }) {
  const t = useT();
  const openMenu = useUi(s => s.openMenu);
  return <IconButton icon="more_vert" label={t('menu.more', { name: service.name })} className={className}
    onClick={e => { e.stopPropagation(); openMenu(service.id, e.currentTarget as HTMLElement); }} />;
}

function AccessLinks({ service }: { service: Service }) {
  const t = useT();
  const addresses = [
    { label: t('home.address.local'), url: appLocalUrl(service) },
    { label: t('home.address.tailscale'), url: service.addresses.tailscaleUrl },
    { label: t('home.address.proxy'), url: service.addresses.proxyUrl },
    { label: t('home.address.custom'), url: service.url },
  ].filter((entry, index, list): entry is { label: string; url: string } =>
    isSafeHttpUrl(entry.url) && list.findIndex(other => other.url === entry.url) === index);
  const copy = async (event: Event, url: string) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      useStore.getState().say(t('home.address.copied'), 'success');
    } catch (error) {
      useStore.getState().say(errorText(error), 'error');
    }
  };
  if (!addresses.length) return <span className="t-body-s text-on-surface-variant">{t('home.address.notConfigured')}</span>;
  return (
    <details className="service-addresses" onClick={event => event.stopPropagation()}>
      <summary className="t-label-m cursor-pointer text-primary">{t('home.address.show', { count: addresses.length })}</summary>
      <span className="mt-2 grid gap-1">
        {addresses.map(({ label, url }) => (
          <span key={url} className="flex min-w-0 items-center gap-1">
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}
              className="t-body-s min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline" title={`${label}: ${url}`}>
              <span className="mr-1 text-on-surface-variant">{label}:</span>{url}
            </a>
            <IconButton icon="content_copy" label={`${t('common.copy')} ${label}`} onClick={event => void copy(event, url)} />
          </span>
        ))}
      </span>
    </details>
  );
}

export function AppCard({ service, showPort, logos }: Props) {
  useT();
  const off = service.status === 'offline';
  return (
    <div className="relative h-full min-w-0">
      <M3eCard variant="filled" actionable className="block h-full min-w-0" onClick={() => openApp(service)}>
        <div className="flex h-full flex-col gap-3 text-left">
          <AppIcon service={service} size={48} radius={16} logos={logos} />
          <span className="block min-w-0">
            <span className={`t-title-m block truncate ${off ? 'text-on-surface-variant' : ''}`}>{service.name}</span>
            <span className="t-body-m line-clamp-2 block text-on-surface-variant">{describeService(service)}</span>
          </span>
          <AccessLinks service={service} />
          <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="flex flex-wrap items-center gap-2"><StatusChip status={service.status} /><UpdateBadge service={service} /></span>
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
      <span slot="supporting-text" className="grid gap-1">
        <span>{describeService(service)}</span>
        <AccessLinks service={service} />
      </span>
      <div slot="trailing" className="flex items-center gap-2">
        <UpdateBadge service={service} />
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
