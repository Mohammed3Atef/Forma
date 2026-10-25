import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchField } from '@/components/ui/Field';
import { OfflineState } from '@/components/ui/ScreenState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useWriteGate } from '@/components/coach/CoachPlanProvider';
import type { LibraryQuery, SortKey } from '@/lib/libraryModel';
import { readSyncIssues, withSyncResult, writeSyncIssues, type SyncIssue } from '@/data/librarySyncIssues';
import type { BulkResult } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { errorMessage } from '@/lib/errorMessage';

/** What every segment gets from the Library screen. */
export interface SegmentProps {
  coachId: string;
  query: LibraryQuery;
  setQuery: (patch: Partial<LibraryQuery>) => void;
  /** > 0 while a "New …" (the header button, `?new=1`) waits for the segment to open its form. */
  createSignal: number;
  /** The segment opened it. */
  onCreateHandled: () => void;
  /** An item to open on arrival (`?open=<id>`, ⌘K), cleared by `onOpened`. */
  openId: string | null;
  onOpened: () => void;
}

/** Writes are off when the coach's own Forma plan has lapsed or the device is offline. */
export function useCanEdit(): { canEdit: boolean; online: boolean; reason: string | undefined } {
  // B3.8 (P2): the coach app's one write gate (plan + connection).
  const { canWrite, online, reason } = useWriteGate();
  return { canEdit: canWrite, online, reason };
}

// ---- toolbar ------------------------------------------------------------------------------------

export interface SortOption {
  key: SortKey;
  label: string;
}

/**
 * Search on its own full-width row (CO-23: never squeezed next to buttons), then the count and
 * Select. Desktop shows the filters inline (the table sorts from its headers); phones and tablets
 * get one "Filters" button that opens the filters and the sort in a sheet, so the list starts high.
 */
export function Toolbar({
  hidden = false,
  query,
  setQuery,
  placeholder,
  searchTestId,
  filters,
  activeFilters = 0,
  onClearFilters,
  sorts,
  desktop,
  selecting,
  onSelecting,
  canSelect,
  count,
}: {
  /** An empty (or not yet loaded) list has nothing to search, filter or select. */
  hidden?: boolean;
  query: LibraryQuery;
  setQuery: (patch: Partial<LibraryQuery>) => void;
  placeholder: string;
  searchTestId: string;
  filters?: ReactNode;
  /** How many filters are on (shown on the phone's Filters button). */
  activeFilters?: number;
  onClearFilters?: () => void;
  sorts: SortOption[];
  desktop: boolean;
  selecting: boolean;
  onSelecting: (on: boolean) => void;
  canSelect: boolean;
  count: ReactNode;
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState(false);
  const sortSelect = (
    <select
      className="input h-11 w-full py-0 pe-8 text-[14px] leading-normal"
      data-testid="lib-sort"
      aria-label={t('library.sortBy')}
      value={`${query.sort}:${query.dir}`}
      onChange={(e) => {
        const [sort, dir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
        setQuery({ sort, dir });
      }}
    >
      {sorts.flatMap((s) => [
        <option key={`${s.key}:asc`} value={`${s.key}:asc`}>
          {t('library.sortAsc', { name: s.label })}
        </option>,
        <option key={`${s.key}:desc`} value={`${s.key}:desc`}>
          {t('library.sortDesc', { name: s.label })}
        </option>,
      ])}
    </select>
  );
  const phoneSheet = !desktop && (filters || sorts.length > 1);
  if (hidden) return null;
  return (
    <div className="mb-3 space-y-2.5">
      <SearchField aria-label={placeholder} placeholder={placeholder} value={query.q} onChange={(e) => setQuery({ q: e.target.value })} data-testid={searchTestId} enterKeyHint="search" />
      <div className="flex flex-wrap items-center gap-2">
        {desktop ? filters : null}
        {phoneSheet ? (
          <button type="button" className={`chip inline-flex items-center gap-1.5 ${activeFilters ? 'chip-on' : ''}`} data-testid="lib-filters" aria-haspopup="dialog" onClick={() => setSheet(true)}>
            <Icon name="list" size={14} aria-hidden="true" />
            {filters ? t('library.filters') : t('library.sortBy')}
            {activeFilters ? <span className="tabular-nums">· {activeFilters}</span> : null}
          </button>
        ) : null}
        <span className="ms-auto flex items-center gap-3">
          <span className="text-[12.5px] text-earth-subtle" data-testid="lib-count" role="status" aria-live="polite">
            {count}
          </span>
          {canSelect ? (
            <button type="button" className={`chip ${selecting ? 'chip-on' : ''}`} aria-pressed={selecting} data-testid="lib-select" onClick={() => onSelecting(!selecting)}>
              {selecting ? t('common.done') : t('library.select')}
            </button>
          ) : null}
        </span>
      </div>
      {phoneSheet ? (
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          size="md"
          title={filters ? t('library.filters') : t('library.sortBy')}
          footer={
            <div className="flex gap-2">
              {filters && onClearFilters ? (
                <Button variant="ghost" className="flex-1" disabled={!activeFilters} onClick={onClearFilters} data-testid="lib-filters-clear">
                  {t('common.clearFilters')}
                </Button>
              ) : null}
              <Button className="flex-1" onClick={() => setSheet(false)} data-testid="lib-filters-done">
                {t('common.done')}
              </Button>
            </div>
          }
        >
          <div className="space-y-4" data-testid="lib-filters-sheet">
            {filters ? <div className="grid gap-3 [&_select]:h-11 [&_select]:w-full [&_select]:max-w-none [&_select]:text-[14px]">{filters}</div> : null}
            {sorts.length > 1 ? (
              <label className="block">
                <span className="label mb-1.5 block">{t('library.sortBy')}</span>
                {sortSelect}
              </label>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/** A compact select filter ("Any muscle" …). */
export function SelectFilter({ value, onChange, label, anyLabel, options, testId }: { value: string; onChange: (v: string) => void; label: string; anyLabel: string; options: { value: string; label: string }[]; testId: string }) {
  return (
    <select className={`input h-11 w-auto min-w-0 max-w-[11rem] py-0 pe-8 text-[13px] leading-normal ${value ? 'border-brand/50 text-earth' : ''}`} aria-label={label} data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---- list paging ----------------------------------------------------------------------------------

/** Desktop: pages of 50 inside the table. Phones and tablets: "Show more" in steps of 30. */
export const TABLE_PAGE = 50;
export const LIST_STEP = 30;

export function usePaged<T>(rows: T[], desktop: boolean, resetKey: string) {
  const pager = usePagination(rows, TABLE_PAGE, resetKey);
  const [visible, setVisible] = useState(LIST_STEP);
  useEffect(() => setVisible(LIST_STEP), [resetKey]);
  const shown = desktop ? pager.pageItems : rows.slice(0, visible);
  const footer = desktop ? (
    <Pagination page={pager.page} totalPages={pager.totalPages} from={pager.from} to={pager.to} total={pager.total} canPrev={pager.canPrev} canNext={pager.canNext} onPrev={pager.prev} onNext={pager.next} />
  ) : visible < rows.length ? (
    <ShowMore remaining={rows.length - visible} onClick={() => setVisible((v) => v + LIST_STEP)} />
  ) : null;
  return { shown, footer };
}

function ShowMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="hit-44 mt-2 w-full text-[14px] font-medium text-earth-muted hover:text-earth" data-testid="lib-show-more" onClick={onClick}>
      {t('library.showMore', { n: remaining })}
    </button>
  );
}

// ---- the states of a list --------------------------------------------------------------------------

/**
 * Loading, failed, offline, empty, no match, or the rows. A list that failed to load says so with
 * Retry — never "your library is empty" (B0 honesty).
 */
export function ListBody({
  q,
  total,
  matched,
  empty,
  onClear,
  testId,
  children,
}: {
  q: UseQueryResult<unknown>;
  total: number;
  matched: number;
  /** What an empty list shows (`FirstItemPanel`). */
  empty: ReactNode;
  onClear: () => void;
  testId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (q.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" data-testid={`${testId}-loading`}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
        ))}
      </div>
    );
  }
  if (q.isError && !q.data) {
    return online ? <ErrorState message={t('library.loadFailed')} onRetry={() => void q.refetch()} testId={`${testId}-error`} /> : <OfflineState onRetry={() => void q.refetch()} testId={`${testId}-offline`} />;
  }
  if (total === 0) return <>{empty}</>;
  if (matched === 0) {
    return (
      <EmptyState
        icon="search"
        title={t('library.noMatch')}
        message={t('library.noMatchHint')}
        testId={`${testId}-no-match`}
        action={
          <Button variant="ghost" onClick={onClear} data-testid="lib-clear">
            {t('common.clearFilters')}
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

// ---- first run ----------------------------------------------------------------------------------

const FIRST_ICON = { programs: 'calendar', groups: 'list', supplements: 'pill' } as const;
/**
 * An empty list's first run (CO-23): what goes here, and one action to add the first one. B4.3:
 * nothing to import — exercises and foods come from Forma's shared library from the first visit.
 */
export function FirstItemPanel({ kind, createLabel, onCreate, createTestId }: { kind: keyof typeof FIRST_ICON; createLabel: string; onCreate?: () => void; createTestId?: string }) {
  const { t } = useTranslation();
  const { canEdit, reason } = useCanEdit();
  return (
    <EmptyState
      icon={FIRST_ICON[kind]}
      title={t(`library.first.${kind}.title`)}
      message={t(`library.first.${kind}.body`)}
      testId="lib-first"
      action={
        onCreate ? (
          <Button icon="plus" disabled={!canEdit} title={reason} onClick={onCreate} data-testid={createTestId}>
            {createLabel}
          </Button>
        ) : undefined
      }
    />
  );
}

// ---- sheets -------------------------------------------------------------------------------------

/**
 * A read-first detail sheet: the item, then its actions — the primary one ("Use in a client plan")
 * on its own full-width row, then Edit and Delete.
 */
export function DetailSheet({ open, onClose, title, testId, primary, secondary, children }: { open: boolean; onClose: () => void; title: string; testId: string; primary?: ReactNode; secondary?: ReactNode; children: ReactNode }) {
  const footer =
    primary || secondary ? (
      <div className="space-y-2">
        {primary}
        {secondary ? <div className="flex items-center gap-2 [&>*:first-child]:min-w-0 [&>*:first-child]:flex-1">{secondary}</div> : null}
      </div>
    ) : undefined;
  return (
    <Sheet open={open} onClose={onClose} size="md" title={title} footer={footer}>
      <div data-testid={testId}>{children}</div>
    </Sheet>
  );
}

const UseInPlanSheetView = lazy(() => import('./UseInPlanSheet'));
/** "Use in a client plan" (its own chunk, loaded when a coach opens it). */
export function UseInPlanSheet(props: { item: { kind: 'exercise' | 'food'; id: string; name: string } | null; onClose: () => void; coachId: string }) {
  return props.item ? (
    <Suspense fallback={null}>
      <UseInPlanSheetView {...props} />
    </Suspense>
  ) : null;
}

// ---- bulk delete --------------------------------------------------------------------------------

/** Select mode's selection + delete, with an honest partial-failure message. */
export function useBulkDelete(run: (ids: string[]) => Promise<BulkResult>, onDone: () => void) {
  const { t } = useTranslation();
  const sel = useSelection();
  const [selecting, setSelectingState] = useState(false);
  const mut = useMutation({
    mutationFn: run,
    onSuccess: (res) => {
      sel.clear();
      onDone();
      if (res.failed > 0) void alertDialog({ title: t('common.delete'), message: t('library.bulkPartial', { ok: res.ok, failed: res.failed }) });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const setSelecting = (on: boolean) => {
    setSelectingState(on);
    if (!on) sel.clear();
  };
  const bar = selecting ? (
    <BulkActionBar count={sel.count} onClear={sel.clear}>
      <button
        type="button"
        data-testid="bulk-delete"
        className="chip text-danger"
        disabled={mut.isPending}
        onClick={async () => {
          if (sel.count && (await confirmDialog({ title: t('common.delete'), message: t('common.bulk.confirmDelete', { n: sel.count }), danger: true, confirmLabel: t('common.delete') }))) mut.mutate(sel.ids);
        }}
      >
        {t('common.bulk.delete')}
      </button>
    </BulkActionBar>
  ) : null;
  return { sel, selecting, setSelecting, bar };
}

// ---- TS-04: template sync results that did not land --------------------------------------------

export function useSyncIssues(coachId: string) {
  const qc = useQueryClient();
  const key = ['librarySyncIssues', coachId];
  const q = useQuery({ queryKey: key, queryFn: () => readSyncIssues(coachId), enabled: !!coachId, staleTime: Infinity, networkMode: 'always' });
  const set = async (next: SyncIssue[]) => {
    qc.setQueryData(key, next);
    await writeSyncIssues(coachId, next);
  };
  const record = (exerciseId: string, name: string, failed: boolean) => void set(withSyncResult(qc.getQueryData<SyncIssue[]>(key) ?? [], exerciseId, name, failed));
  return { issues: q.data ?? [], set, record };
}

const SyncIssuesBanner = lazy(() => import('./SyncIssuesNotice'));
/** TS-04: shown (and its code loaded) only while a sync result is waiting for Retry. */
export function SyncIssuesNotice({ coachId }: { coachId: string }) {
  const { issues } = useSyncIssues(coachId);
  return issues.length ? (
    <Suspense fallback={null}>
      <SyncIssuesBanner coachId={coachId} />
    </Suspense>
  ) : null;
}
