import { M3eCard } from '@m3e/react/card';
import { trn, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { AlertCard } from '@/components/AlertCard';
import { useAlertActions } from './HomeView';

export function AlertsView({ go }: { go: (v: 'history') => void }) {
  const t = useT();
  const alerts = useStore(s => s.alerts);
  const a = useAlertActions(go);
  if (alerts.length === 0) {
    return (
      <M3eCard variant="filled" className="mt-8 block max-w-3xl">
        <div className="flex flex-col items-center gap-3 p-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="notifications_none" size={32} /></span>
          <p className="t-title-m">{t('alerts.none')}</p>
          <p className="t-body-m max-w-xs text-on-surface-variant">{t('alerts.noneText')}</p>
        </div>
      </M3eCard>
    );
  }
  return (
    <div className="grid max-w-3xl gap-4">
      <M3eCard variant="filled" className="block">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-error-container text-on-error-container"><Icon name="notifications_active" fill /></span>
          <div className="min-w-0 flex-1">
            <h2 className="t-title-l">{t('alerts.title')}</h2>
            <p className="t-body-m text-on-surface-variant">{t('alerts.summary')}</p>
          </div>
          <span className="t-label-l shrink-0 rounded-full bg-error-container px-3 py-1.5 text-on-error-container">
            {trn('alerts.count', alerts.length)}
          </span>
        </div>
      </M3eCard>
      {alerts.map(x => <AlertCard key={x.id} alert={x} onDismiss={id => void a.dismiss(id)} onAction={a.act} />)}
    </div>
  );
}
