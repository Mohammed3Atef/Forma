import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/Icon';

/**
 * Right-hand master-detail panel for desktop CRM layouts. Shows an empty state
 * (icon + message) until a row is selected, then renders `children`. Always
 * rendered inside the desktop shell (never mobile), so its sticky offset and
 * max-height both clear `DesktopTopBar` specifically — a bare `top-4` used to
 * stick 16px from the very top of the viewport, which is well above
 * `DesktopTopBar`'s own ~4rem, so the panel visibly scrolled underneath it.
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
    <aside
      data-testid={testId}
      className="card sticky top-[calc(var(--desktop-topbar-h)+1rem)] max-h-[calc(100dvh-var(--desktop-topbar-h)-2rem)] min-w-0 overflow-y-auto"
    >
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
