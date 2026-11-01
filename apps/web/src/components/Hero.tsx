import type { Service } from '@shared/types';
import { M3eCard } from '@m3e/react/card';
import { Btn } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { isBusy, isDown } from '@/lib/status';
import { runAction } from '@/lib/actions';
import { trn, useT } from '@/lib/i18n';

/** The Material 3 Expressive "cookie" shape: a circle with 9 scallops. */
const COOKIE = (() => {
  let d = '';
  const n = 9, a = 0.07, R = 41;
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2, r = R * (1 + a * Math.cos(n * t));
    d += (i ? 'L' : 'M') + (50 + r * Math.cos(t)).toFixed(2) + ' ' + (50 + r * Math.sin(t)).toFixed(2);
  }
  return d + 'Z';
})();

export function Hero({ services, alertCount, onGoAlerts }: {
  services: Service[];
  alertCount: number;
  onGoAlerts: () => void;
}) {
  const t = useT();
  const h = new Date().getHours();
  const greet = t(h < 12 ? 'hero.morning' : h < 18 ? 'hero.afternoon' : 'hero.evening');
  const online = services.filter(s => s.status === 'online').length;
  const down = services.filter(s => isDown(s.status));
  const busy = services.filter(s => isBusy(s.status)).length;
  const problem = down.length > 0;
  const stopped = down.filter(s => s.status === 'offline' && s.source === 'docker');
  const updates = services.filter(service => service.imageUpdateStatus === 'outdated').length;

  let title = t('hero.allGood', { greet });
  if (problem) title = trn('hero.attention', down.length, { greet });
  else if (busy) title = t('hero.almost', { greet });

  const sub = t('hero.summary', { online, total: services.length });

  return (
    <M3eCard variant="filled" className={`dashboard-hero block dashboard-hero--${problem ? 'attention' : busy ? 'starting' : 'ready'}`}>
      <section>
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-14 w-14 shrink-0" aria-hidden="true">
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
              <path d={COOKIE} style={{ fill: problem ? 'var(--warning)' : 'var(--primary)', transition: 'fill .4s' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: problem ? 'var(--on-warning)' : 'var(--on-primary)' }}>
              <Icon name={problem ? 'priority_high' : 'check'} size={28} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="t-title-l">{title}</h1>
            <p className="t-body-m mt-1 text-on-surface-variant">{sub}</p>
          </div>
          {(stopped.length === 1 || alertCount > 0) && (
            <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
              {stopped.length === 1 && <Btn variant="filled" icon="play_arrow" onClick={() => void runAction(stopped[0], 'start')}>{t('hero.start', { name: stopped[0].name })}</Btn>}
              {alertCount > 0 && <Btn variant={stopped.length === 1 ? 'text' : 'tonal'} icon="notifications" onClick={onGoAlerts}>{trn('alerts.count', alertCount)}</Btn>}
            </div>
          )}
        </div>
        <div className="dashboard-hero-metrics mt-5" aria-label={t('home.overview')}>
          <div><span className="dashboard-hero-value">{online}</span><span className="dashboard-hero-label">{t('home.running')}</span></div>
          <div><span className="dashboard-hero-value">{down.length}</span><span className="dashboard-hero-label">{t('hero.stopped')}</span></div>
          <div><span className="dashboard-hero-value">{updates}</span><span className="dashboard-hero-label">{t('home.updates')}</span></div>
          <div><span className="dashboard-hero-value">{alertCount}</span><span className="dashboard-hero-label">{t('hero.alerts')}</span></div>
        </div>
      </section>
    </M3eCard>
  );
}
