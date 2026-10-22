import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/services/auth/sessionStore';
import { LIBRARY_SEGMENTS, libraryParams, parseLibraryQuery, segmentQuery, type LibraryQuery, type LibrarySegment } from '@/lib/libraryModel';
import { SyncIssuesNotice, useCanEdit, type SegmentProps } from './parts';
import { useStarterLibrary } from './useStarterLibrary';
import { StarterShownContext } from './starterSignal';

// Each segment is its own chunk: opening the Library loads only the one on screen (budget §9).
const ProgramsSegment = lazy(() => import('./ProgramsSegment'));
const ExercisesSegment = lazy(() => import('./ExercisesSegment'));
const FoodsSegment = lazy(() => import('./FoodsSegment'));
const SupplementsSegment = lazy(() => import('./SupplementsSegment'));
const SEGMENT_VIEW: Record<LibrarySegment, React.LazyExoticComponent<(p: SegmentProps) => JSX.Element>> = {
  programs: ProgramsSegment,
  exercises: ExercisesSegment,
  foods: FoodsSegment,
  supplements: SupplementsSegment,
};
const PANEL_ID = 'library-panel';

/**
 * The coach's Library (B3.7, blueprint §6.6 — "My reusable content"): Programs · Exercises · Foods
 * (swap groups inside) · Supplements on one screen. The segment, its search, filters and sort live
 * in the URL (`lib/libraryModel`), so Back from a program, a reload or a link restores the same
 * view; `/coach/templates` redirects here (`?tab=programs`). Links may also ask to create (`?new=1`
 * — ⌘K "New exercise / New food", DT-08) or open one item (`?open=<id>`); both are consumed once.
 */
export function CoachLibrary() {
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseLibraryQuery(params), [params]);
  const { canEdit, reason } = useCanEdit();
  const starter = useStarterLibrary();
  const [starterShown, setStarterShown] = useState(false);

  // One-shot intents carried by the URL, removed as soon as they are read (Back / reload never repeat them).
  // A pending "New …" request: > 0 until the segment on screen has opened its form (then back to 0,
  // so a segment that mounts later never re-opens it).
  const [createSignal, setCreateSignal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const isNew = params.get('new') === '1';
    const open = params.get('open');
    const legacy = params.get('tab') === 'groups';
    if (!isNew && !open && !legacy) return;
    // B3.8 (P2): never open a creation form a lapsed Forma plan could not save.
    if (isNew && canEdit) setCreateSignal((n) => n + 1);
    if (open) setOpenId(open);
    setParams(libraryParams(parseLibraryQuery(params)), { replace: true });
  }, [params, setParams, canEdit]);
  const onOpened = useCallback(() => setOpenId(null), []);
  const onCreateHandled = useCallback(() => setCreateSignal(0), []);

  const setQuery = useCallback(
    (patch: Partial<LibraryQuery>) => setParams((cur) => libraryParams({ ...parseLibraryQuery(cur), ...patch }), { replace: true }),
    [setParams],
  );
  const switchSegment = (segment: LibrarySegment) => {
    setCreateSignal(0);
    setOpenId(null);
    setParams(libraryParams(segmentQuery(segment)), { replace: true });
  };

  const seg = query.segment;
  const groups = seg === 'foods' && query.view === 'groups';
  const newLabel = seg === 'programs' ? t('library.newProgram') : seg === 'exercises' ? t('coachLib.newExercise') : seg === 'supplements' ? t('coachSupps.newSupp') : groups ? t('coachFoods.newGroup') : t('coachFoods.newFood');
  const newTestId = seg === 'programs' ? 'template-new' : seg === 'exercises' ? 'lib-new' : seg === 'supplements' ? 'supp-new' : groups ? 'group-new' : 'food-new';
  const Segment = SEGMENT_VIEW[seg];

  return (
    <div className="w-full pb-6 pt-3" data-testid="coach-library" data-segment={seg}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="t-title">{t('coachLib.title')}</h1>
          <p className="mt-0.5 hidden text-[14px] text-earth-muted sm:block">{t('library.subtitle')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button icon="plus" variant={starterShown ? 'secondary' : 'primary'} data-testid={newTestId} aria-label={newLabel} title={reason} disabled={!canEdit} onClick={() => setCreateSignal((n) => n + 1)}>
            <span className="hidden sm:inline">{newLabel}</span>
          </Button>
          <ActionMenu
            label={t('library.more')}
            testId="lib-more"
            items={[{ key: 'starter', label: t('starter.load'), icon: 'download', disabled: !canEdit || starter.pending, testId: 'lib-load-starter', onSelect: () => void starter.run() }]}
          />
        </div>
      </header>

      <SectionTabs
        className="mb-4"
        label={t('library.sections')}
        panelId={PANEL_ID}
        testIdPrefix="lib-tab"
        active={seg}
        onChange={switchSegment}
        tabs={LIBRARY_SEGMENTS.map((key) => ({ key, label: t(`coachLib.tabs.${key}`) }))}
      />

      <SyncIssuesNotice coachId={coachId} />

      <div role="tabpanel" id={PANEL_ID} aria-labelledby={`${PANEL_ID}-tab-${seg}`}>
        <Suspense
          fallback={
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-11 w-full rounded-ui-control" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
              ))}
            </div>
          }
        >
          <StarterShownContext.Provider value={setStarterShown}>
            <Segment key={seg} coachId={coachId} query={query} setQuery={setQuery} createSignal={createSignal} onCreateHandled={onCreateHandled} openId={openId} onOpened={onOpened} />
          </StarterShownContext.Provider>
        </Suspense>
      </div>
    </div>
  );
}
