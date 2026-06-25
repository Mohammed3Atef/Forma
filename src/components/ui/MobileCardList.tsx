import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RowCheckbox } from './RowCheckbox';

/** Optional row-selection wiring for bulk actions (see `useSelection`). */
export interface CardSelection<T> {
  isSelected: (item: T) => boolean;
  onToggle: (item: T) => void;
}

/**
 * The standard mobile fallback for a DataTable: a card of stacked, optionally
 * tappable rows. Pair with `<DataTable>` behind `hidden lg:block` / `lg:hidden`.
 * Pass `selection` to prepend a checkbox (tapping it toggles selection without
 * triggering the row's own click).
 */
export function MobileCardList<T>({
  items,
  rowKey,
  renderItem,
  onItemClick,
  selection,
  empty,
  className = '',
  testId,
}: {
  items: T[];
  rowKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onItemClick?: (item: T) => void;
  selection?: CardSelection<T>;
  empty?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={`card divide-y divide-line-soft p-0 ${className}`} data-testid={testId}>
      {items.map((item) => {
        const checkbox = selection ? (
          <RowCheckbox checked={selection.isSelected(item)} onToggle={() => selection.onToggle(item)} label={t('common.bulk.selectRow')} testId="row-select" />
        ) : null;
        const body = renderItem(item);
        if (onItemClick) {
          return (
            <div
              key={rowKey(item)}
              data-testid="mobile-card-row"
              className={`flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover ${selection?.isSelected(item) ? 'bg-brand/10' : ''}`}
            >
              {checkbox}
              <button type="button" onClick={() => onItemClick(item)} className="min-w-0 flex-1 text-start">
                {body}
              </button>
            </div>
          );
        }
        return (
          <div
            key={rowKey(item)}
            data-testid="mobile-card-row"
            className={`flex items-center gap-3 px-4 py-3 ${selection?.isSelected(item) ? 'bg-brand/10' : ''}`}
          >
            {checkbox}
            <div className="min-w-0 flex-1">{body}</div>
          </div>
        );
      })}
    </div>
  );
}
