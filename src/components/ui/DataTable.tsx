import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RowCheckbox } from './RowCheckbox';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Optional extra classes for the cell/header (e.g. alignment, width). */
  className?: string;
  /** Hide below this is handled by callers; keep columns lean for narrow desktops. */
}

/** Optional row-selection wiring for bulk actions (see `useSelection`). */
export interface TableSelection<T> {
  isSelected: (row: T) => boolean;
  onToggle: (row: T) => void;
  /** True when every row on the page is selected. */
  allSelected: boolean;
  /** True when some (but not all) rows on the page are selected. */
  someSelected: boolean;
  onToggleAll: (on: boolean) => void;
}

/**
 * Generic desktop table inside a `.card` wrapper, with a sticky header and a
 * horizontal-scroll guard (never overflows the page). Callers render mobile
 * cards instead — this is desktop-only (wrap in a `hidden lg:block`).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  selection,
  empty,
  caption,
  testId,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Enables a leading checkbox column for bulk selection. */
  selection?: TableSelection<T>;
  empty?: ReactNode;
  /** Accessible table description (visually hidden) for screen readers. */
  caption?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const colSpan = columns.length + (selection ? 1 : 0);
  return (
    <div className="card min-w-0 overflow-x-auto p-0" data-testid={testId}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-start">
            {selection ? (
              <th scope="col" className="w-10 px-4 py-3 text-start">
                <RowCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.someSelected && !selection.allSelected}
                  onToggle={() => selection.onToggleAll(!selection.allSelected)}
                  label={t('common.selectAll')}
                  testId="select-all"
                />
              </th>
            ) : null}
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-3 text-start font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-earth-muted ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-earth-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const k = rowKey(row);
              const selected = selectedKey === k;
              const checked = selection?.isSelected(row) ?? false;
              const clickable = !!onRowClick;
              return (
                <tr
                  key={k}
                  data-testid="data-row"
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); } } : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  role={clickable ? 'button' : undefined}
                  className={`border-b border-line-soft last:border-b-0 ${clickable ? 'cursor-pointer transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover' : ''} ${selected || checked ? 'bg-brand/10' : ''}`}
                >
                  {selection ? (
                    <td className="w-10 px-4 py-3 align-middle">
                      <RowCheckbox checked={checked} onToggle={() => selection.onToggle(row)} label={t('common.bulk.selectRow')} testId="row-select" />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
