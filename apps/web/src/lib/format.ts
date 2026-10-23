import { locale, tr } from './i18n';

const MIN = 60_000, HOUR = 3600_000, DAY = 24 * HOUR;

export function relTime(ts: number, now = Date.now()): string {
  const d = now - ts;
  if (d < 45_000) return tr('time.now');
  if (d < HOUR) return tr('time.minutesAgo', { n: Math.max(1, Math.round(d / MIN)) });
  if (d < DAY) return tr('time.hoursAgo', { n: Math.round(d / HOUR) });
  return tr('time.daysAgo', { n: Math.round(d / DAY) });
}

export function duration(ms: number): string {
  if (ms <= 0) return '0 s';
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (ms < HOUR) return `${Math.round(ms / MIN)} min`;
  if (ms < DAY) { const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(ms / DAY), h = Math.round((ms % DAY) / HOUR);
  return h ? `${d} d ${h} h` : `${d} d`;
}

export const clock = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export const dateOnly = (ts: number) => new Date(ts).toLocaleDateString(locale());

export function dayLabel(ts: number, now = Date.now()): string {
  const a = new Date(ts), b = new Date(now);
  if (a.toDateString() === b.toDateString()) return tr('time.today');
  if (a.toDateString() === new Date(now - DAY).toDateString()) return tr('time.yesterday');
  return a.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

export function bytes(n: number): string {
  const fmt = (v: number, digits: number) => v.toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const gb = n / 1024 ** 3;
  if (gb >= 100) return `${fmt(gb, 0)} GB`;
  if (gb >= 1) return `${fmt(gb, 1)} GB`;
  return `${fmt(n / 1024 ** 2, 0)} MB`;
}

export const pct = (n: number) =>
  `${n.toLocaleString(locale(), { maximumFractionDigits: n >= 99.995 || n === 0 ? 0 : 2 })}%`;
