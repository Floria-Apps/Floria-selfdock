import { useEffect, useState } from 'react';
import type { Service } from '@shared/types';
import { Icon } from '@/ui/Icon';
import { catIcon, catOf } from '@/lib/categories';

/** The app's logo (downloaded and cached by the server) or, if there is none, a tonal icon for its category. */
export function AppIcon({ service, size, radius, logos = true }: { service: Service; size: number; radius: number; logos?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [service.icon]);
  const off = service.status === 'offline';
  const box = { width: size, height: size, borderRadius: radius };

  if (logos && service.icon && !failed) {
    const iconUrl = service.icon === 'navidrome.svg'
      ? `/api/icons/${service.icon}?v=2`
      : `/api/icons/${service.icon}`;
    return (
      <span className="flex shrink-0 items-center justify-center" style={{ ...box, background: '#F7FAF9', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)' }}>
        <img src={iconUrl} alt="" draggable={false} onError={() => setFailed(true)}
          style={{ width: size * 0.62, height: size * 0.62, objectFit: 'contain', filter: off ? 'grayscale(1)' : 'none', opacity: off ? 0.55 : 1 }} />
      </span>
    );
  }
  const t = catOf(service.category).t;
  const tile = off ? { background: 'var(--sc-highest)', color: 'var(--on-surface-variant)' } : { background: `var(--t${t}-bg)`, color: `var(--t${t}-fg)` };
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ ...box, ...tile }}>
      <Icon name={catIcon(service.category)} fill={!off} size={Math.round(size * 0.58)} />
    </span>
  );
}
