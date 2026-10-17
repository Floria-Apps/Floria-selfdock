import { useT } from '@/lib/i18n';
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
      <div className="mt-12 flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="notifications_none" size={32} /></span>
        <p className="t-title-m">{t('alerts.none')}</p>
        <p className="t-body-m max-w-xs text-on-surface-variant">{t('alerts.noneText')}</p>
      </div>
    );
  }
  return (
    <div className="grid max-w-3xl gap-3">
      {alerts.map(x => <AlertCard key={x.id} alert={x} onDismiss={id => void a.dismiss(id)} onAction={a.act} />)}
    </div>
  );
}
