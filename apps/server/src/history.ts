import type { Availability, Incident, Service } from '@shared/types';
import type { DB } from './db';

const DAY = 24 * 3600 * 1000;

interface Row {
  id: number; service_key: string; service_name: string; kind: string;
  planned: number; cause: string | null; started_at: number; ended_at: number | null;
}

export function listIncidents(db: DB, limit: number): Incident[] {
  const rows = db.prepare('SELECT * FROM incidents ORDER BY started_at DESC LIMIT ?').all(limit) as unknown as Row[];
  return rows.map(r => ({
    id: r.id, serviceId: r.service_key, serviceName: r.service_name, kind: r.kind,
    planned: !!r.planned, cause: r.cause, startedAt: r.started_at, endedAt: r.ended_at,
  }));
}

/** Share of time available over the last 24 h and 7 days. Stops requested by the user do not count as downtime. */
export function computeAvailability(db: DB, services: Service[], trackedSince: number, now = Date.now()): Availability[] {
  const rows = db.prepare(
    'SELECT service_key, started_at, ended_at FROM incidents WHERE planned = 0 AND (ended_at IS NULL OR ended_at > ?)',
  ).all(now - 7 * DAY) as unknown as { service_key: string; started_at: number; ended_at: number | null }[];

  const pct = (key: string, windowMs: number) => {
    const start = Math.max(now - windowMs, trackedSince);
    const span = now - start;
    if (span <= 0) return 100;
    let down = 0;
    for (const r of rows) {
      if (r.service_key !== key) continue;
      const a = Math.max(r.started_at, start), b = Math.min(r.ended_at ?? now, now);
      if (b > a) down += b - a;
    }
    return Math.round(Math.max(0, 100 - (down / span) * 100) * 100) / 100;
  };

  return services.map(s => ({
    serviceId: s.id,
    name: s.name,
    last24h: pct(s.id, DAY),
    last7d: pct(s.id, 7 * DAY),
    incidents7d: rows.filter(r => r.service_key === s.id).length,
  }));
}
