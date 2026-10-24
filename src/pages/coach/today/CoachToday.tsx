import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { ListGroup, Section } from '@/components/ui/ListRow';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState } from '@/components/ui/ScreenState';
import { Skeleton } from '@/components/ui/Skeleton';
import { CoachChecklist } from '@/pages/coach/onboarding/CoachChecklist';
import { CoachTrialBanner } from '@/pages/coach/onboarding/CoachTrialBanner';
import { useCapacityFollowsRoster } from '@/components/coach/CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { coachPlanQuery } from '@/services/platform/coachPlanApi';
import { listWorkoutTemplates } from '@/services/platform/coachAssetsApi';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { formatDate, formatTime } from '@/lib/format';
import { today as todayKey, weekRange } from '@/lib/utils';
import { buildDirectory } from '@/lib/coachDirectory';
import { buildTodayQueue, parseFocus, SECTION_OF, TODAY_KINDS, TODAY_SECTIONS, type TodayItem, type TodayKind, type TodaySection } from '@/lib/coachToday';
import { useCoachSources } from '@/hooks/useCoachSources';
import { SECTION_ICON, TodayRow, useTodayReason, type TodayPerson } from './TodayRow';
import { TodayDetail } from './TodayDetail';

/** Rows shown per section before "Show N more" (the overview chips still count everything). */
const SECTION_CAP = 5;
/** The onboarding checklist is for a coach's first clients only (CO-17: never "Get started" for an established roster). */
const CHECKLIST_MAX_CLIENTS = 3;

/**
 * Today (B3.2 / blueprint §6.1, CO-05 / CO-06 / CO-17 / JR-02 / DT-02): the
 * coach's landing — a queue, not a report. Every row is who · why (with its
 * evidence) · one action, grounded in stored data (`buildTodayQueue`); no
 * KPI wall, no "at risk" score. Desktop ≥ 1024: queue + the selected item's
 * panel (review a check-in / decide a transfer in place; J / K to move).
 * The old dashboard's numbers live in Me › Business.
 */
export function CoachToday() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const coachId = account?.id ?? '';
  const online = useOnlineStatus();
  const desktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const focus = parseFocus(params.get('focus'));

  const { sources, updatedAt, refreshing, refresh } = useCoachSources(coachId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const queue = useMemo(() => buildTodayQueue(sources, { coachId, now, todayKey: todayKey() }), [sources, coachId, now]);
  // B3.9: the desktop panel's client context — the same directory rows Clients shows, from sources already loaded.
  const contextRows = useMemo(() => {
    if (!desktop) return null;
    const day = todayKey();
    return new Map(buildDirectory(sources, { coachId, now, todayKey: day, weekStart: weekRange(day).weekStart }).rows.map((r) => [r.id, r]));
  }, [desktop, sources, coachId, now]);
  const reasonOf = useTodayReason();

  const plan = useQuery(coachPlanQuery(coachId));
  const rosterSize = queue.rosterSize;
  useCapacityFollowsRoster(rosterSize); // the trial banner's count is the server's (B3.8, D5)
  const templates = useQuery({
    queryKey: ['workoutTemplates', coachId],
    queryFn: () => listWorkoutTemplates(coachId),
    enabled: !!coachId && rosterSize !== null && rosterSize < CHECKLIST_MAX_CLIENTS,
  });

  // People: the roster's names (the assessment's full name when the account name is only the email's local part).
  const people = useMemo(() => {
    const full = new Map((sources.summaries.data ?? []).map((s) => [s.clientId, (s as { fullName?: string | null }).fullName ?? null]));
    const map = new Map<string, TodayPerson>();
    for (const u of (sources.roster.data ?? []) as { id: string; displayName?: string; email?: string; photoUrl?: string }[]) {
      const local = u.email?.split('@')[0];
      const fullName = full.get(u.id);
      const name = fullName && (!u.displayName || u.displayName === local) ? fullName : u.displayName || u.email || t('coach.client');
      map.set(u.id, { name, photoUrl: u.photoUrl });
    }
    return map;
  }, [sources.roster.data, sources.summaries.data, t]);
  const person = useCallback((id: string): TodayPerson => people.get(id) ?? { name: t('coach.client') }, [people, t]);

  const shown = focus ? queue.items.filter((i) => i.kind === focus) : queue.items;

  // Desktop selection (kept on the same item across refreshes; the next one when it resolves).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = shown.find((i) => i.key === selectedKey) ?? shown[0] ?? null;
  const rowRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const selectNext = useCallback(() => {
    const idx = shown.findIndex((i) => i.key === selected?.key);
    const next = shown[idx + 1] ?? shown[idx - 1] ?? null;
    setSelectedKey(next?.key ?? null);
  }, [shown, selected]);
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || !el || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable || document.querySelector('[role="dialog"]')) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      e.preventDefault();
      const idx = Math.max(0, shown.findIndex((i) => i.key === selected?.key));
      const next = shown[e.key === 'j' ? Math.min(shown.length - 1, idx + 1) : Math.max(0, idx - 1)];
      if (next) {
        setSelectedKey(next.key);
        rowRefs.current.get(next.key)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop, shown, selected]);

  // Phones: the check-in review and the transfer decision open in place; everything else navigates.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const sheetItem = sheetKey ? queue.items.find((i) => i.key === sheetKey) ?? null : null;
  const activate = (it: TodayItem) => {
    if (desktop) return setSelectedKey(it.key);
    if ((it.kind === 'checkin' && it.checkIn) || it.kind === 'transfer') return setSheetKey(it.key);
    navigate(it.to);
  };

  const [expanded, setExpanded] = useState<Set<TodaySection>>(new Set());
  const setFocus = (k: TodayKind | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set('focus', k);
    else next.delete('focus');
    next.delete('tab'); // the old dashboard's tabs are gone
    setParams(next, { replace: true });
  };

  const firstName = (account?.displayName || '').trim().split(/\s+/)[0];
  const stamp = updatedAt ? formatTime(updatedAt, lang) : null;
  const total = queue.items.length;
  const anyError = TODAY_KINDS.some((k) => queue.status[k] === 'error');
  const anyLoading = TODAY_KINDS.some((k) => queue.status[k] === 'loading');
  const trustworthyEmpty = queue.complete && online && !queue.stale;

  // ---- whole-screen states (the roster is every item's base) ----
  const header = (
    <header className="mb-5">
      <h1 className="t-title">{t('coachNav.today')}</h1>
      <p className="mt-0.5 text-[14px] text-earth-muted">{formatDate(now, lang, 'full')}</p>
    </header>
  );
  if (!sources.roster.data) {
    return (
      <div className="mx-auto w-full max-w-3xl pb-6 pt-3" data-testid="coach-today" data-state={!online || sources.roster.paused ? 'offline' : sources.roster.error ? 'error' : 'loading'}>
        {header}
        {/* B3.9 (CO-18 / PF-21): a read paused offline is offline — never an endless skeleton. */}
        {!online || sources.roster.paused ? (
          <OfflineState message={t('coachToday.offlineEmpty')} onRetry={refresh} testId="today-offline" />
        ) : sources.roster.error ? (
          <ErrorState onRetry={refresh} testId="today-error" />
        ) : (
          <div className="space-y-2" aria-busy="true" data-testid="today-loading">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-ui-surface" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const notices = plan.data ? <CoachTrialBanner plan={plan.data} /> : null;
  const checklist =
    rosterSize !== null && rosterSize < CHECKLIST_MAX_CLIENTS && templates.data ? <CoachChecklist totalClients={rosterSize} templatesCreated={templates.data.length} /> : null;

  if (rosterSize === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 pb-6 pt-3" data-testid="coach-today" data-state="new">
        {header}
        {notices}
        <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card px-5 py-6 text-center" data-testid="today-new-coach">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-ui-control bg-brand/[0.13] text-brand-hover">
            <Icon name="users" size={24} />
          </span>
          <h2 className="text-[18px] font-semibold">{firstName ? t('coachToday.newCoach.title', { name: firstName }) : t('coachToday.newCoach.titleNoName')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-earth-muted">{t('coachToday.newCoach.message')}</p>
          <Button className="mt-4" data-testid="today-add-client" onClick={() => navigate('/coach/clients?new=1')}>
            {t('coachToday.newCoach.cta')}
          </Button>
        </div>
        {checklist}
      </div>
    );
  }

  // ---- the queue ----
  // An honest all-clear is said once, by its card; every other state names itself here.
  const summary = total > 0 ? t('coachToday.summary', { count: total }) : trustworthyEmpty ? null : anyError ? t('coachToday.partial') : anyLoading ? t('coachToday.loading') : t('coachToday.notFresh');
  const staleLine =
    !online || queue.stale ? (
      <p className="flex items-center gap-1.5 text-[12px] text-earth-subtle" role="status" data-testid="today-stale">
        <Icon name={online ? 'info' : 'cloud'} size={13} />
        {t(online ? 'coachToday.staleFailed' : 'coachToday.offlineStale', { time: stamp ?? '—' })}
      </p>
    ) : null;

  const chips = TODAY_KINDS.filter((k) => queue.counts[k] > 0);
  const errorKinds = TODAY_KINDS.filter((k) => queue.status[k] === 'error');

  const sectionBlocks = TODAY_SECTIONS.map((section) => {
    const items = shown.filter((i) => i.section === section);
    // One error line per failing source group (renewal + lapsed share one, plan + inactivity share one).
    const errs = [...new Set(errorKinds.filter((k) => SECTION_OF[k] === section && (!focus || k === focus)).map((k) => t(`coachToday.what.${k}`)))];
    const loading = TODAY_KINDS.some((k) => SECTION_OF[k] === section && queue.status[k] === 'loading' && (!focus || k === focus));
    if (items.length === 0 && errs.length === 0 && !loading) return null;
    const open = expanded.has(section) || !!focus;
    const visible = open ? items : items.slice(0, SECTION_CAP);
    return (
      <Section
        key={section}
        testId={`today-section-${section}`}
        title={
          <span className="flex items-center gap-2">
            <Icon name={SECTION_ICON[section]} size={17} className="text-earth-muted" />
            {t(`coachToday.sections.${section}`)}
            {items.length ? <span className="text-[14px] font-medium text-earth-subtle">{items.length}</span> : null}
          </span>
        }
      >
        <ListGroup>
          {visible.map((it) => (
            <div key={it.key} ref={(el) => void rowRefs.current.set(it.key, (el?.firstElementChild as HTMLButtonElement | null) ?? null)}>
              <TodayRow item={it} person={person(it.clientId)} reason={reasonOf(it, now)} selected={desktop && selected?.key === it.key} onActivate={() => activate(it)} />
            </div>
          ))}
          {errs.map((what) => (
            <div key={what} className="flex items-center gap-3 px-4 py-3 text-[13px]" role="alert" data-testid="today-kind-error">
              <Icon name="alert" size={16} className="shrink-0 text-warn" />
              <span className="min-w-0 flex-1 text-earth-muted">{t('coachToday.kindError', { what })}</span>
              <button type="button" className="hit-44 shrink-0 font-semibold text-brand-hover" onClick={refresh}>
                {t('common.retry')}
              </button>
            </div>
          ))}
          {loading && items.length === 0 && errs.length === 0 ? <Skeleton className="m-3 h-10 rounded-ui-control" /> : null}
        </ListGroup>
        {items.length > SECTION_CAP && !focus ? (
          <button
            type="button"
            className="hit-44 mt-1 text-[13px] font-medium text-earth-muted hover:text-earth"
            data-testid={`today-more-${section}`}
            aria-expanded={open}
            onClick={() => setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(section)) next.delete(section);
              else next.add(section);
              return next;
            })}
          >
            {open ? t('coachToday.showLess') : t('coachToday.showMore', { count: items.length - SECTION_CAP })}
          </button>
        ) : null}
      </Section>
    );
  });

  const comingUp =
    queue.comingUp.length > 0 && !focus ? (
      <Section
        testId="today-coming-up"
        title={<span className="flex items-center gap-2"><Icon name="clock" size={17} className="text-earth-muted" />{t('coachToday.comingUp')}</span>}
        // Today shows at most five; every renewal of the next 30 days is in Me › Business (B3.8).
        action={<Link to="/coach/business?tab=renewals" className="hit-44 text-[13px] font-semibold text-brand hover:underline" data-testid="today-coming-up-all">{t('coachToday.comingUpAll')}</Link>}
      >
        <ListGroup>
          {queue.comingUp.slice(0, SECTION_CAP).map((c) => (
            <button key={c.clientId} type="button" onClick={() => navigate(c.to)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-white/[0.03]" data-testid="today-coming-up-row">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold leading-snug">{person(c.clientId).name}</span>
                <span className="mt-0.5 block truncate text-[13px] text-earth-muted">
                  {t(c.trial ? 'coachToday.reason.trialEnds' : 'coachToday.reason.renewal', { count: c.days, date: formatDate(c.lastDay, lang, 'weekdayDayMonth') })}
                </span>
              </span>
              <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
            </button>
          ))}
        </ListGroup>
      </Section>
    ) : null;

  const queueColumn = (
    <div className="min-w-0 space-y-6">
      {total === 0 && trustworthyEmpty ? (
        <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card px-5 py-7 text-center" data-testid="today-all-clear">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/[0.14] text-success">
            <Icon name="check" size={24} />
          </span>
          <h2 className="text-[18px] font-semibold">{t('coachToday.allClear')}</h2>
          <p className="mx-auto mt-1 max-w-sm text-[14px] text-earth-muted">{t('coachToday.allClearSub')}</p>
        </div>
      ) : null}
      {total === 0 && !trustworthyEmpty && !anyError && !anyLoading ? (
        // Offline / a failed refresh with nothing waiting in the last good load: say exactly that, never "all caught up".
        <p className="rounded-ui-surface border border-white/[0.07] bg-surface-card px-4 py-4 text-[14px] text-earth-muted" data-testid="today-empty-stale">
          {t('coachToday.emptyAsOf', { time: stamp ?? '—' })}
        </p>
      ) : null}
      {sectionBlocks}
      {comingUp}
    </div>
  );

  // Two panes only on desktop with something to show; otherwise one reading column for everything (header included).
  const twoPane = desktop && shown.length > 0;
  return (
    <div className={`mx-auto w-full pb-6 pt-3 ${twoPane ? '' : 'max-w-2xl'}`} data-testid="coach-today" data-state={total ? 'queue' : trustworthyEmpty ? 'clear' : 'incomplete'}>
      {header}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {summary ? (
            <p className="text-[17px] font-semibold" data-testid="today-summary" aria-live="polite">
              {summary}
            </p>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2 text-[12px] text-earth-subtle">
            {stamp ? <span data-testid="today-updated">{t('coachToday.updated', { time: stamp })}</span> : null}
            <button type="button" onClick={refresh} disabled={refreshing} className="hit-44 inline-flex items-center gap-1 font-medium text-earth-muted hover:text-earth disabled:opacity-50" data-testid="today-refresh">
              <Icon name="rotate" size={14} className={refreshing ? 'animate-spin' : undefined} />
              {t('coachToday.refresh')}
            </button>
          </span>
        </div>
        {staleLine}
        {chips.length > 1 || focus ? (
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label={t('coachToday.filter')}
            data-testid="today-chips"
          >
            {focus ? (
              <button type="button" className="chip shrink-0 whitespace-nowrap" data-testid="today-chip-all" onClick={() => setFocus(null)}>
                {t('coachToday.showAll')}
              </button>
            ) : null}
            {chips.map((k) => (
              <button key={k} type="button" className={`chip shrink-0 whitespace-nowrap ${focus === k ? 'chip-on' : ''}`} aria-pressed={focus === k} data-testid={`today-chip-${k}`} onClick={() => setFocus(focus === k ? null : k)}>
                {t(`coachToday.kinds.${k}`, { count: queue.counts[k] })}
              </button>
            ))}
          </div>
        ) : null}
        {notices}
        {checklist}
      </div>

      {twoPane ? (
        // 1024–1279 px: the labelled rail leaves ~720 px, so the panes split evenly (each about a phone sheet wide).
        // B3.9: from 1280 px a 5 : 7 split — the queue rows stop wrapping and the panel keeps the client's context.
        <div className="grid grid-cols-2 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-6">
          {queueColumn}
          <aside
            className="sticky top-[calc(var(--desktop-topbar-h,3.5rem)+1rem)] max-h-[calc(100dvh-var(--desktop-topbar-h,3.5rem)-2rem)] self-start overflow-y-auto rounded-ui-surface border border-white/[0.07] bg-surface-card p-5"
            aria-label={t('coachToday.detail.label')}
            data-testid="today-panel"
          >
            {selected ? (
              <TodayDetail key={selected.key} item={selected} person={person(selected.clientId)} reason={reasonOf(selected, now)} coachId={coachId} onResolved={selectNext} context={contextRows?.get(selected.clientId)} />
            ) : null}
            <p className="mt-5 text-[12px] text-earth-subtle">{t('coachToday.detail.keyboard')}</p>
          </aside>
        </div>
      ) : (
        queueColumn
      )}

      <Sheet open={!!sheetItem} onClose={() => setSheetKey(null)} size="lg" title={sheetItem ? person(sheetItem.clientId).name : ''}>
        {sheetItem ? (
          <TodayDetail item={sheetItem} person={person(sheetItem.clientId)} reason={reasonOf(sheetItem, now)} coachId={coachId} compact onResolved={() => setSheetKey(null)} />
        ) : null}
      </Sheet>
    </div>
  );
}
