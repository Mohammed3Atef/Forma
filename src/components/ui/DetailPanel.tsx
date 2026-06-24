import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Right-hand master-detail panel for desktop CRM layouts. Shows an empty state
 * (icon + message) until a row is selected, then renders `children`.
 */
export function DetailPanel({
  empty,
  emptyMessage,
  emptyIcon = 'info',
  children,
  testId,
}: {
  /** True when nothing is selected → show the empty state. */
  empty: boolean;
  emptyMessage: string;
  emptyIcon?: IconName;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <aside data-testid={testId} className="card sticky top-4 max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto">
      {empty ? (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 py-10 text-center text-earth-subtle">
          <Icon name={emptyIcon} size={28} />
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </aside>
  );
}
