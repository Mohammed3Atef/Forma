import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Optional extra classes for the cell/header (e.g. alignment, width). */
  className?: string;
  /** Hide below this is handled by callers; keep columns lean for narrow desktops. */
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
  empty,
  testId,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  empty?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="card min-w-0 overflow-x-auto p-0" data-testid={testId}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-start">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-4 py-3 text-start font-mono text-[10.5px] uppercase tracking-[0.06em] text-earth-subtle ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-earth-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const k = rowKey(row);
              const selected = selectedKey === k;
              return (
                <tr
                  key={k}
                  data-testid="data-row"
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-line-soft last:border-b-0 ${onRowClick ? 'cursor-pointer transition-colors hover:bg-white/[0.03]' : ''} ${selected ? 'bg-brand/10' : ''}`}
                >
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
