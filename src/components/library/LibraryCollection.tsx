import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { RowCheckbox } from '@/components/ui/RowCheckbox';

/**
 * The Library's list foundation (B3.7, TB-04 / TB-08): one table for desktop and one list for
 * phones and tablets, sharing the same rules —
 *  - a row opens its item (read-first); secondary and destructive actions live in the row menu,
 *    never as a bare icon on every row;
 *  - bulk actions exist only in an explicit Select mode: checkboxes appear, a tap selects instead
 *    of opening, and the row menu steps aside;
 *  - the table's headers are real column names, sortable where it helps (`aria-sort`), and lower-
 *    priority columns fold away on narrower desktops instead of scrolling sideways.
 * Data, sorting and paging stay with the caller (`lib/libraryModel`).
 */

export interface CollectionSelection {
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
}

export interface CollectionColumn<T> {
  key: string;
  /** The real column name (also the sort button's label). */
  header: string;
  cell: (row: T) => ReactNode;
  /** Sortable when set: the sort key this header applies. */
  sortKey?: string;
  /** Width and priority, e.g. `w-[14%] hidden xl:table-cell` (the cell gets the same classes). */
  className?: string;
  align?: 'start' | 'end';
  /** The row's name: rendered as the button that opens the row. Exactly one column. */
  primary?: boolean;
}

interface Common<T> {
  rows: T[];
  rowKey: (row: T) => string;
  /** Accessible name of a row (its open button, its checkbox, its menu). */
  rowName: (row: T) => string;
  onOpen: (row: T) => void;
  selecting?: boolean;
  selection?: CollectionSelection;
  /** Secondary actions of a row (not shown while selecting). */
  menu?: (row: T) => ActionMenuItem[];
  testId?: string;
  rowTestId?: string;
}

export function CollectionTable<T>({
  columns,
  sort,
  dir,
  onSort,
  caption,
  rows,
  rowKey,
  rowName,
  onOpen,
  selecting = false,
  selection,
  menu,
  testId,
  rowTestId = 'data-row',
}: Common<T> & {
  columns: CollectionColumn<T>[];
  sort?: string;
  dir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  caption: string;
}) {
  const { t } = useTranslation();
  const ids = rows.map(rowKey);
  const allOn = ids.length > 0 && !!selection && ids.every((id) => selection.has(id));
  const someOn = !!selection && ids.some((id) => selection.has(id));
  const onRow = (e: MouseEvent, row: T) => {
    if ((e.target as HTMLElement).closest('a,button,input,select')) return;
    if (selecting && selection) selection.toggle(rowKey(row));
    else onOpen(row);
  };
  const alignClass = (c: CollectionColumn<T>) => (c.align === 'end' ? 'text-end' : 'text-start');

  return (
    <div className="overflow-hidden rounded-ui-surface border border-white/[0.07] bg-surface-card" data-testid={testId} data-selecting={selecting || undefined}>
      <table className="w-full table-fixed border-collapse text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-white/[0.07] text-[12px] uppercase tracking-wide text-earth-subtle">
          <tr>
            {selecting && selection ? (
              <th scope="col" className="w-12 px-3 py-2.5 text-start">
                <span className="hit-44 inline-flex">
                  <RowCheckbox checked={allOn} indeterminate={someOn && !allOn} onToggle={() => selection.setMany(ids, !allOn)} label={t('library.selectPage')} testId="select-all" />
                </span>
              </th>
            ) : null}
            {columns.map((c) => {
              const active = !!c.sortKey && sort === c.sortKey;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-2.5 font-medium ${alignClass(c)} ${c.className ?? ''}`}
                  aria-sort={c.sortKey ? (active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none') : undefined}
                >
                  {c.sortKey && onSort ? (
                    <button type="button" className={`inline-flex max-w-full items-center gap-1 uppercase hover:text-earth ${active ? 'text-earth' : ''}`} data-testid={`sort-${c.sortKey}`} onClick={() => onSort(c.sortKey!)}>
                      <span className="truncate">{c.header}</span>
                      {active ? <Icon name="chevronDown" size={13} className={`shrink-0 ${dir === 'desc' ? '' : 'rotate-180'}`} /> : null}
                    </button>
                  ) : (
                    <span className="block truncate">{c.header}</span>
                  )}
                </th>
              );
            })}
            {menu && !selecting ? (
              <th scope="col" className="w-14 px-2 py-2.5">
                <span className="sr-only">{t('common.actions')}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {rows.map((row) => {
            const id = rowKey(row);
            const name = rowName(row);
            const on = !!selection?.has(id);
            return (
              <tr key={id} data-testid={rowTestId} data-id={id} aria-selected={selecting ? on : undefined} className={`cursor-pointer align-middle transition-colors hover:bg-white/[0.03] ${on ? 'bg-brand/10' : ''}`} onClick={(e) => onRow(e, row)}>
                {selecting && selection ? (
                  <td className="px-3 py-2">
                    <span className="hit-44 inline-flex">
                      <RowCheckbox checked={on} onToggle={() => selection.toggle(id)} label={t('library.selectItem', { name })} testId="row-select" />
                    </span>
                  </td>
                ) : null}
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${alignClass(c)} ${c.className ?? ''}`}>
                    {c.primary ? (
                      <button
                        type="button"
                        className="flex min-h-ui-hit w-full min-w-0 items-center text-start font-semibold hover:underline"
                        data-testid="row-open"
                        aria-label={selecting ? t('library.selectItem', { name }) : undefined}
                        onClick={() => (selecting && selection ? selection.toggle(id) : onOpen(row))}
                      >
                        <span className="min-w-0 flex-1 truncate">{c.cell(row)}</span>
                      </button>
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
                {menu && !selecting ? (
                  <td className="px-2 py-2 text-end">
                    <ActionMenu label={t('library.itemActions', { name })} size="sm" testId="row-menu" items={menu(row)} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Phones and tablets: one row per item — name, one line of facts, an optional badge. */
export function CollectionList<T>({
  render,
  rows,
  rowKey,
  rowName,
  onOpen,
  selecting = false,
  selection,
  testId,
  rowTestId = 'lib-row',
}: Common<T> & {
  render: (row: T) => { title: ReactNode; meta?: ReactNode; trailing?: ReactNode };
}) {
  const { t } = useTranslation();
  return (
    <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-ui-surface border border-white/[0.07] bg-surface-card" data-testid={testId} data-selecting={selecting || undefined}>
      {rows.map((row) => {
        const id = rowKey(row);
        const name = rowName(row);
        const on = !!selection?.has(id);
        const r = render(row);
        return (
          <li key={id} className={`flex items-center gap-2 ps-3 ${on ? 'bg-brand/10' : ''}`} data-testid={rowTestId} data-id={id}>
            {selecting && selection ? (
              <span className="hit-44 inline-flex">
                <RowCheckbox checked={on} onToggle={() => selection.toggle(id)} label={t('library.selectItem', { name })} testId="row-select" />
              </span>
            ) : null}
            <button
              type="button"
              className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 py-2 pe-3 text-start"
              data-testid="row-open"
              aria-pressed={selecting ? on : undefined}
              onClick={() => (selecting && selection ? selection.toggle(id) : onOpen(row))}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.title}</span>
                {r.meta ? <span className="mt-0.5 block truncate text-[12.5px] text-earth-subtle">{r.meta}</span> : null}
              </span>
              {r.trailing}
              {!selecting && <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
