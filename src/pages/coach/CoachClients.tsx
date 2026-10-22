import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ListGroup } from '@/components/ui/ListRow';
import { OfflineState } from '@/components/ui/ScreenState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { IncomingTransferRequests } from '@/components/coach/IncomingTransferRequests';
import { useCapacityFollowsRoster, useCoachCapacity, useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useCoachSources } from '@/hooks/useCoachSources';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePagination } from '@/hooks/usePagination';
import { useSession } from '@/services/auth/sessionStore';
import { today as todayKey, weekRange } from '@/lib/utils';
import {
  buildDirectory,
  filterRows,
  matchesTask,
  sortRows,
  type CheckInState,
  type ClientState,
  type DirectoryQuery,
  type DirectorySort,
  type DirectoryTask,
  type PlanFilter,
} from '@/lib/coachDirectory';
import { AddClientSheet, type AddMode } from './clients/AddClientSheet';
import { CheckInsView } from './clients/CheckInsView';
import { DirectoryTable } from './clients/DirectoryTable';
import { FiltersSheet } from './clients/FiltersSheet';
import { OutgoingTransfers } from './clients/OutgoingTransfers';
import { ClientRow, useRowReason } from './clients/parts';

const TASKS: DirectoryTask[] = ['needs', 'checkin', 'renewal', 'lapsed'];
const STATES: ClientState[] = ['active', 'trial', 'expiring', 'paused', 'expired', 'pending', 'none'];
const CHECKINS: CheckInState[] = ['review', 'overdue', 'awaiting', 'notRequested', 'done'];
const PLANS: PlanFilter[] = ['noWorkout', 'noNutrition'];
const SORTS: DirectorySort[] = ['needs', 'name', 'lastWorkout', 'daysLeft', 'workouts'];
const pick = <T extends string>(list: readonly T[], v: string | null): T | null => (v && (list as readonly string[]).includes(v) ? (v as T) : null);
/** Phones / tablets: progressive "Show more" (TB-07); desktop: pages inside the table. */
const LIST_STEP = 20;
const TABLE_PAGE = 50;

/**
 * Clients (B3.3 / blueprint §6.2, owner brief 2026-10-17): the coach's
 * directory. Built from the same sources and queue rules as Today
 * (`buildDirectory`), so "Needs you" here is exactly Today's list. Search
 * (name, email, phone — searchable, never shown in rows), task chips, filter
 * & sort (package, this week's check-in, plans; needs / name / last workout /
 * days left / workouts 7d), weekly check-ins (`?view=checkins`, the old
 * `/coach/checkins`), incoming and outgoing transfers, and Add client (invite
 * or existing — both kept, O-3). Every view lives in the URL.
 */
export function CoachClients() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const account = useSession((s) => s.account);
  const coachId = account?.id ?? '';
  const desktop = useIsDesktop();
  const online = useOnlineStatus();
  const { canWrite } = useCoachPlan();
  const [params, setParams] = useSearchParams();

  // ---- URL state --------------------------------------------------------------
  const query: DirectoryQuery = {
    q: params.get('q') ?? '',
    task: pick(TASKS, params.get('task')),
    state: pick(STATES, params.get('state')),
    checkin: pick(CHECKINS, params.get('checkin')),
    plan: pick(PLANS, params.get('plan')),
    sort: pick(SORTS, params.get('sort')) ?? 'needs',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
  };
  const view = params.get('view') === 'checkins' ? 'checkins' : 'list';
  const setQuery = (patch: Partial<DirectoryQuery> & { view?: 'list' | 'checkins' }) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      const empty = v === null || v === undefined || v === '' || (k === 'sort' && v === 'needs') || (k === 'dir' && v === 'asc') || (k === 'view' && v === 'list');
      if (empty) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace: true });
  };

  // `?new=1` (⌘K, Today, the checklist): open the add sheet, then clear the param so Back / refresh never reopens it.
  const [adding, setAdding] = useState(() => params.get('new') === '1');
  const [addMode, setAddMode] = useState<AddMode>('choose');
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setAddMode('choose');
    setAdding(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);
  const openAdd = () => {
    setAddMode('choose');
    setAdding(true);
  };
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ---- data ---------------------------------------------------------------------
  const { sources, refresh } = useCoachSources(coachId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const day = todayKey();
  const week = weekRange(day).weekStart;
  const dir = useMemo(() => buildDirectory(sources, { coachId, now, todayKey: day, weekStart: week }), [sources, coachId, now, day, week]);
  const reasonOf = useRowReason();
  const rowReason = (r: (typeof dir.rows)[number]) => reasonOf(r, now);

  const searched = useMemo(() => filterRows(dir.rows, { q: query.q }), [dir.rows, query.q]);
  const filtered = useMemo(() => sortRows(filterRows(dir.rows, query), query.sort, query.dir), [dir.rows, query.q, query.task, query.state, query.checkin, query.plan, query.sort, query.dir]); // eslint-disable-line react-hooks/exhaustive-deps
  const taskCount = (task: DirectoryTask) => searched.filter((r) => matchesTask(r, task)).length;
  const advancedOn = [query.state, query.checkin, query.plan].filter(Boolean).length + (query.sort !== 'needs' ? 1 : 0);
  const resetKey = JSON.stringify(query);
  const pager = usePagination(filtered, TABLE_PAGE, resetKey);
  const [visible, setVisible] = useState(LIST_STEP);
  useEffect(() => setVisible(LIST_STEP), [resetKey]);

  // ---- capacity (B3.8 D5: the server's count — the one that gates a new client; lapsed or full blocks NEW clients only) ----
  const capacity = useCoachCapacity();
  useCapacityFollowsRoster((sources.roster.data as unknown[] | undefined)?.length);
  const maxClients = capacity.known ? capacity.limit : Infinity;
  const usedClients = capacity.used;
  const lapsed = capacity.lapsed;
  const overBy = capacity.over;
  const atLimit = capacity.atLimit;
  const nearLimit = capacity.nearLimit;

  // ---- render ---------------------------------------------------------------------
  const header = (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="t-title">{t('coachClients.title')}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-earth-muted">
          {Number.isFinite(maxClients) ? (
            <span className={`flex flex-wrap items-center gap-x-2 ${atLimit || nearLimit ? 'text-warn' : ''}`} data-testid="coach-client-usage">
              {t('coachTrial.usage', { used: usedClients, max: maxClients })}
              {overBy > 0 ? (
                <Link to="/coach/plan" className="underline-offset-2 hover:underline" data-testid="coach-client-limit">
                  {t('forma.capacity.overBy', { n: overBy })} · {t('forma.addCapacity')}
                </Link>
              ) : atLimit ? (
                <Link to="/coach/plan" className="underline-offset-2 hover:underline" data-testid="coach-client-limit">
                  {lapsed ? t('forma.renew') : `${t('coachTrial.limitReached')} · ${t('forma.addCapacity')}`}
                </Link>
              ) : null}
            </span>
          ) : dir.rosterReady ? (
            <span data-testid="clients-count">{t('coachClients.count', { count: dir.rows.length })}</span>
          ) : null}
        </div>
      </div>
      <Button
        icon="plus"
        data-testid="coach-add-client"
        aria-label={t('coach.addClient')}
        title={!online ? t('offline.actionDisabled') : undefined}
        disabled={!canWrite || !online}
        onClick={openAdd}
        className="shrink-0"
      >
        <span className="hidden sm:inline">{t('coachClients.add')}</span>
      </Button>
    </header>
  );

  const addSheet = (
    <AddClientSheet
      open={adding}
      mode={addMode}
      onMode={setAddMode}
      onClose={() => setAdding(false)}
      onAdded={() => {
        void qc.invalidateQueries({ queryKey: ['myClients', coachId] });
        void qc.invalidateQueries({ queryKey: ['coachRelationships', coachId] });
        void qc.invalidateQueries({ queryKey: ['coachDashboardSummaries', coachId] });
      }}
      coachId={coachId}
      coachName={account?.displayName ?? ''}
      atLimit={atLimit}
      maxClients={maxClients}
    />
  );

  // Whole-screen states: the roster is every row's base.
  if (!dir.rosterReady) {
    return (
      <div className="w-full pb-6 pt-3" data-testid="coach-clients" data-state={!online || dir.rosterOffline ? 'offline' : dir.rosterError ? 'error' : 'loading'}>
        {header}
        {/* B3.9 (CO-18 / PF-21): a read paused offline is offline — never an endless skeleton. */}
        {!online || dir.rosterOffline ? (
          <OfflineState onRetry={refresh} testId="coach-clients-offline" />
        ) : dir.rosterError ? (
          <ErrorState message={t('coach.clientsLoadFailed')} onRetry={refresh} testId="coach-clients-error" />
        ) : (
          <div className="space-y-2" aria-busy="true" data-testid="clients-loading">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-ui-surface" />
            ))}
          </div>
        )}
        {addSheet}
      </div>
    );
  }

  const chipBtn = (key: string, label: string, count: number | null, active: boolean, onClick: () => void) => (
    <button key={key} type="button" className={`chip shrink-0 whitespace-nowrap ${active ? 'chip-on' : ''}`} aria-pressed={active} data-testid={`clients-${key}`} onClick={onClick}>
      {label}
      {count != null ? <span className="ms-1.5 tabular-nums">{count}</span> : null}
    </button>
  );
  const notices = (
    <>
      {!online || dir.stale ? (
        <p className="mb-3 flex items-center gap-1.5 text-[12px] text-earth-subtle" role="status" data-testid="clients-stale">
          <Icon name={online ? 'info' : 'cloud'} size={13} />
          {t(online ? 'coachClients.stale' : 'coachClients.offline')}
        </p>
      ) : null}
      {online && (!dir.activityKnown || !dir.checkInsKnown) ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-earth-muted" role="alert" data-testid="clients-partial">
          <Icon name="alert" size={15} className="text-warn" />
          {t('coachClients.partial')}
          <button type="button" className="hit-44 font-semibold text-brand-hover" onClick={refresh}>
            {t('common.retry')}
          </button>
        </p>
      ) : null}
    </>
  );

  const empty = dir.rows.length === 0;
  const listBody = empty ? (
    <EmptyState
      icon="users"
      title={t('coach.noClientsTitle')}
      message={t('coach.noClientsMessage')}
      testId="clients-empty"
      action={
        <Button icon="plus" disabled={!canWrite || !online} onClick={openAdd}>
          {t('coach.addClient')}
        </Button>
      }
    />
  ) : filtered.length === 0 ? (
    <EmptyState
      icon="search"
      title={t('coachClients.noMatchTitle')}
      message={t('coachClients.noMatchMessage')}
      testId="clients-no-match"
      action={
        <Button variant="ghost" onClick={() => setQuery({ q: '', task: null, state: null, checkin: null, plan: null })}>
          {t('coachClients.clear')}
        </Button>
      }
    />
  ) : desktop ? (
    <div className="space-y-3">
      <DirectoryTable
        rows={pager.pageItems}
        sort={query.sort ?? 'needs'}
        dir={query.dir ?? 'asc'}
        onSort={(s) => setQuery({ sort: s, dir: query.sort === s && query.dir === 'asc' ? 'desc' : 'asc' })}
        reasonOf={rowReason}
      />
      {pager.totalPages > 1 ? <Pagination page={pager.page} totalPages={pager.totalPages} from={pager.from} to={pager.to} total={pager.total} canPrev={pager.canPrev} canNext={pager.canNext} onPrev={pager.prev} onNext={pager.next} /> : null}
    </div>
  ) : (
    <div>
      {/* Tablet: two columns, row-major. `divide-y-0` would also zero the row borders, so they are set with `!`; the last row has none. */}
      <ListGroup className="md:grid md:grid-cols-2 md:divide-y-0 md:[&>*]:border-white/[0.06] md:[&>*]:!border-b md:[&>*:nth-child(odd)]:border-e md:[&>*:nth-last-child(-n+2)]:!border-b-0">
        {filtered.slice(0, visible).map((r) => (
          <ClientRow key={r.id} row={r} reason={rowReason(r)} />
        ))}
      </ListGroup>
      {visible < filtered.length ? (
        <button type="button" className="hit-44 mt-2 w-full text-[14px] font-medium text-earth-muted hover:text-earth" data-testid="clients-load-more" onClick={() => setVisible((v) => v + LIST_STEP)}>
          {t('coachClients.loadMore')} ({filtered.length - visible})
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="w-full pb-6 pt-3" data-testid="coach-clients" data-view={view}>
      {header}
      {coachId ? <IncomingTransferRequests coachId={coachId} /> : null}

      {!empty ? (
        <div className="mb-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
                <Icon name="search" size={18} />
              </span>
              <input
                className="input ps-10"
                type="search"
                data-testid="coach-clients-search"
                aria-label={t('coachClients.search')}
                placeholder={t('coachClients.search')}
                value={query.q}
                onChange={(e) => setQuery({ q: e.target.value })}
              />
            </div>
            {view === 'list' ? (
              <Button
                variant="ghost"
                icon="list"
                data-testid="clients-filters-button"
                aria-haspopup="dialog"
                aria-label={advancedOn ? t('coachClients.filtersOn', { count: advancedOn }) : t('coachClients.filters')}
                onClick={() => setFiltersOpen(true)}
              >
                <span className="hidden sm:inline">{advancedOn ? t('coachClients.filtersOn', { count: advancedOn }) : t('coachClients.filters')}</span>
                {advancedOn ? <span className="sm:hidden">{advancedOn}</span> : null}
              </Button>
            ) : null}
          </div>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('coachClients.filters')}>
            {chipBtn('task-all', t('coachClients.task.all'), searched.length, view === 'list' && !query.task, () => setQuery({ task: null, view: 'list' }))}
            {TASKS.map((task) => chipBtn(`task-${task}`, t(`coachClients.task.${task}`), taskCount(task), view === 'list' && query.task === task, () => setQuery({ task: query.task === task ? null : task, view: 'list' })))}
            {chipBtn('view-checkins', t('coachClients.task.checkins'), null, view === 'checkins', () => setQuery({ view: view === 'checkins' ? 'list' : 'checkins' }))}
          </div>
        </div>
      ) : null}

      {notices}

      {view === 'checkins' && !empty ? (
        <CheckInsView rows={searched} known={dir.checkInsKnown} coachId={coachId} weekStart={week} onRetry={refresh} />
      ) : (
        listBody
      )}

      <div className="mt-8">{coachId ? <OutgoingTransfers coachId={coachId} /> : null}</div>

      <FiltersSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        query={query}
        onChange={(patch) => setQuery(patch)}
        checkInsKnown={dir.checkInsKnown}
        activityKnown={dir.activityKnown}
      />
      {addSheet}
    </div>
  );
}
