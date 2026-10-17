import type { Alert, Cause, Service } from '@shared/types';
import { describeCatalog, tr, type Key } from './i18n';
import { bytes } from './format';

/** Text shown under the app name: the user's own description, or a translated one for well-known apps. */
export function describeService(s: Service): string {
  return s.description || describeCatalog(s.catalog) || (s.source === 'manual' ? tr('desc.manual') : '');
}

/** Turns a cause code from the server (`oom`, `exit:1`...) into a sentence. */
export function causeText(cause: Cause | null): string | null {
  if (!cause) return null;
  if (cause.startsWith('exit:')) return tr('cause.exit', { code: cause.slice(5) });
  const key = `cause.${cause}` as Key;
  const text = tr(key);
  return text === key ? null : text;
}

/** Turns a structured alert from the server into the title and text shown on the card. */
export function alertText(a: Alert): { title: string; text: string; action?: string } {
  const p = a.params;
  const action = a.action ? tr(`alert.action.${a.action.kind}` as Key) : undefined;
  switch (a.kind) {
    case 'disk': return { title: tr('alert.disk.title', { percent: p.percent }), text: tr('alert.disk.text', { free: bytes(Number(p.free)) }), action };
    case 'ram': return { title: tr('alert.ram.title', { percent: p.percent }), text: tr('alert.ram.text'), action };
    case 'loop': return { title: tr('alert.loop.title', { name: String(p.name), count: p.count }), text: tr('alert.loop.text'), action };
    case 'unhealthy': return { title: tr('alert.unhealthy.title', { name: String(p.name) }), text: causeText('unhealthy') ?? '', action };
    default: return { title: tr('alert.down.title', { name: String(p.name) }), text: causeText(String(p.cause) || null) ?? tr('alert.down.fallback'), action };
  }
}
