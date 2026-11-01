import type { ReactNode } from 'react';
import { M3eBadge } from '@m3e/react/badge';
import { M3eCard } from '@m3e/react/card';
import { M3eList } from '@m3e/react/list';

export function M3eSectionList({ children, title, count }: { children: ReactNode; title?: string; count?: number }) {
  return (
    <M3eCard variant="filled" className="update-section-card block">
      {title && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 bg-surface-container/50">
          <span className="t-title-s text-on-surface font-semibold">{title}</span>
          {count !== undefined && <M3eBadge>{count}</M3eBadge>}
        </div>
      )}
      <M3eList variant="segmented" className="divide-y divide-outline-variant/10">
        {children}
      </M3eList>
    </M3eCard>
  );
}
