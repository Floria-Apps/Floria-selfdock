import type { CSSProperties } from 'react';
import { M3eCircularProgressIndicator } from '@m3e/react/progress-indicator';

/** A Material 3 circular progress indicator with the value in the middle. */
export function Gauge({ label, sub, value, warn }: { label: string; sub: string; value: number; warn?: boolean }) {
  const v = Math.min(100, Math.max(0, value));
  const style = {
    '--m3e-circular-flat-progress-indicator-diameter': '64px',
    '--m3e-circular-progress-indicator-thickness': '6px',
    ...(warn ? { '--m3e-progress-indicator-color': 'var(--warning)' } : {}),
  } as CSSProperties;
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-sc-low p-4 text-center">
      <M3eCircularProgressIndicator value={v} max={100} style={style} aria-label={`${label}: ${Math.round(v)}%`}>
        <span className="t-label-l">{Math.round(v)}%</span>
      </M3eCircularProgressIndicator>
      <div className="min-w-0">
        <p className="t-title-m">{label}</p>
        <p className="t-body-s text-on-surface-variant">{sub}</p>
      </div>
    </div>
  );
}
