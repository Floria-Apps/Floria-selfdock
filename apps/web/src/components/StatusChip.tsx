import type { Status } from '@shared/types';
import { STATUS_COLORS, statusLabel } from '@/lib/status';
import { useT } from '@/lib/i18n';

export function StatusChip({ status }: { status: Status }) {
  useT();
  const c = STATUS_COLORS[status];
  return (
    <span className="t-label-m inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5" style={{ background: c.bg, color: c.fg }}>
      <span className="h-2 w-2 rounded-full" style={{ background: 'currentColor' }} />
      {statusLabel(status)}
    </span>
  );
}
