import type { Alert } from '@shared/types';
import { M3eCard } from '@m3e/react/card';
import { M3eChip } from '@m3e/react/chips';
import { M3eDivider } from '@m3e/react/divider';
import { M3eHeading } from '@m3e/react/heading';
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
    <M3eCard variant="filled" className={`alert-card block alert-card--${err ? 'error' : 'warning'}`}>
      <article className="flex items-start gap-4">
        <span className={`alert-card-icon ${err ? 'alert-card-icon--error' : 'alert-card-icon--warning'}`}>
          <Icon name={alert.icon} fill />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <M3eHeading variant="title" size="medium" level={3} className="alert-card-title min-w-0 flex-1">
              {title}
            </M3eHeading>
            <M3eChip variant="elevated" className={`alert-card-severity alert-card-severity--${err ? 'error' : 'warning'}`}>
              <Icon slot="icon" name={err ? 'error' : 'warning'} />
              {t(err ? 'alerts.severity.error' : 'alerts.severity.warning')}
            </M3eChip>
          </div>
          <p className="t-body-m mt-2 text-on-surface-variant">{text}</p>
          <M3eDivider className="my-3" />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="alert-card-time t-label-m">
              <Icon name="schedule" size={16} />
              <span>{relTime(alert.at)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => onDismiss(alert.id)}>{t('common.dismiss')}</Btn>
              {action && <Btn variant="tonal" onClick={() => onAction(alert)}>{action}</Btn>}
            </div>
          </div>
        </div>
      </article>
    </M3eCard>
  );
}
