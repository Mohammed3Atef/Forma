import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Action bar for bulk operations on a selectable list. Renders only when one or
 * more rows are selected: shows the count, the caller's action buttons, and a
 * Clear button. Sticks to the bottom of the viewport (clearing the mobile tab
 * bar) so it stays reachable while scrolling a long list.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
  className = '',
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <div
      data-testid="bulk-action-bar"
      className={`sticky bottom-[84px] z-30 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-md md:bottom-4 ${className}`}
    >
      <span className="text-sm font-semibold" data-testid="bulk-count">
        {t('common.bulk.selected', { n: count })}
      </span>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {children}
        <button type="button" data-testid="bulk-clear" onClick={onClear} className="chip">
          {t('common.bulk.clear')}
        </button>
      </div>
    </div>
  );
}
