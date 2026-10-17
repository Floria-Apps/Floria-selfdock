import type { Alert } from '@shared/types';
import { Btn } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { alertText } from '@/lib/describe';
import { relTime } from '@/lib/format';
import { useT } from '@/lib/i18n';

export function AlertCard({ alert, onDismiss, onAction }: { alert: Alert; onDismiss: (id: string) => void; onAction: (a: Alert) => void }) {
  const t = useT();
  const err = alert.level === 'error';
  const { title, text, action } = alertText(alert);
  return (
    <article className="flex items-start gap-4 rounded-2xl bg-sc-low p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${err ? 'bg-error-container text-on-error-container' : 'bg-warning-container text-on-warning-container'}`}>
        <Icon name={alert.icon} fill />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="t-title-m">{title}</h3>
        <p className="t-body-m mt-1 text-on-surface-variant">{text}</p>
        <p className="t-label-m mt-1 text-on-surface-variant">{relTime(alert.at)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={() => onDismiss(alert.id)}>{t('common.dismiss')}</Btn>
          {action && <Btn variant="tonal" onClick={() => onAction(alert)}>{action}</Btn>}
        </div>
      </div>
    </article>
  );
}
