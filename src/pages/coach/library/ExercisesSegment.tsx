import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { AttributionLine, DemoBadge } from '@/components/library/ExerciseDemo';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { blankExercise } from '@/lib/workoutPresets';
import { muscleLabel } from '@/lib/muscle';
import { attributionOf, exerciseDemo } from '@/lib/libraryMedia';
import { collatorFor, equipmentOptions, filterExercises, muscleOptions, nextSort, sortExercises, type SortKey } from '@/lib/libraryModel';
import { bulkDeleteExercises, deleteExercise, listExercises, saveExercise } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { Exercise } from '@/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { DetailSheet, ListBody, SelectFilter, StarterPanel, ToggleFilter, Toolbar, UseInPlanSheet, useBulkDelete, useCanEdit, usePaged, useSyncIssues, type SegmentProps } from './parts';

// The detail view and the form load when first opened (they are not needed to browse).
const ExerciseView = lazy(() => import('@/components/workout/ExerciseView').then((m) => ({ default: m.ExerciseView })));
const ExerciseForm = lazy(() => import('@/components/workout/ExerciseForm').then((m) => ({ default: m.ExerciseForm })));
const sheetFallback = <Skeleton className="h-64 w-full rounded-ui-surface" />;

/**
 * Library › Exercises (B3.7): find one of hundreds quickly (search, muscle, equipment, "Has video",
 * sort), see honestly whether it has a demo, open it read-first, and from there use it in a
 * client's plan or edit it. Saving an exercise also updates the templates linked to it; when that
 * part fails the Library keeps a notice with Retry (TS-04, `SyncIssuesNotice`).
 */
export default function ExercisesSegment({ coachId, query, setQuery, createSignal, onCreateHandled, openId, onOpened }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { canEdit, reason } = useCanEdit();
  const sync = useSyncIssues(coachId);
  const lib = useQuery({ queryKey: ['exerciseLibrary', coachId], queryFn: () => listExercises(coachId), enabled: !!coachId });
  const all = useMemo(() => lib.data ?? [], [lib.data]);
  const collator = useMemo(() => collatorFor(i18n.language), [i18n.language]);
  const label = (m: string) => muscleLabel(m, t) || m;

  const [viewing, setViewing] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [using, setUsing] = useState<Exercise | null>(null);

  // The header's "New exercise" (and ⌘K's) opens the form.
  useEffect(() => {
    if (createSignal <= 0) return;
    setEditing(blankExercise());
    onCreateHandled();
  }, [createSignal, onCreateHandled]);
  // ⌘K / a link to one exercise opens it once the list is here.
  useEffect(() => {
    if (!openId || !lib.data) return;
    const ex = lib.data.find((e) => e.id === openId);
    if (ex) setViewing(ex);
    onOpened();
  }, [openId, lib.data, onOpened]);

  const filtered = useMemo(
    () => sortExercises(filterExercises(all, query, label), query.sort, query.dir, collator, label),
    [all, query.q, query.muscle, query.equipment, query.video, query.sort, query.dir, collator, i18n.language], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const resetKey = JSON.stringify([query.q, query.muscle, query.equipment, query.video, query.sort, query.dir]);
  const { shown, footer } = usePaged(filtered, desktop, resetKey);
  const muscles = useMemo(() => muscleOptions(all, label, collator), [all, collator, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipment = useMemo(() => equipmentOptions(all, collator), [all, collator]);
  const anyAttribution = useMemo(() => all.map(attributionOf).find(Boolean) ?? null, [all]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] });
    void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
    // The save synced this exercise INTO templates server-side — an open template must not keep (and re-save) the old copy.
    void qc.invalidateQueries({ queryKey: ['workoutTemplate', coachId] });
  };
  const save = useMutation({
    mutationFn: (ex: Exercise) => saveExercise(coachId, ex),
    onSuccess: (res, ex) => {
      setEditing(null);
      invalidate();
      sync.record(ex.id, ex.name, res.status === 'failed');
      // A failed template sync is the persistent notice (with Retry), not a toast that vanishes.
      if (res.status !== 'failed') showToast({ title: t('common.saved'), body: res.affectedTemplates > 0 ? t('coachLib.templatesUpdated', { n: res.affectedTemplates }) : undefined, variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachLib.newExercise'), message: e instanceof Error ? e.message : t('common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteExercise(coachId, id),
    onSuccess: () => {
      setViewing(null);
      void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] });
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const remove = async (ex: Exercise) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: ex.name }), danger: true, confirmLabel: t('common.delete') })) del.mutate(ex.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteExercises(coachId, ids), () => void qc.invalidateQueries({ queryKey: ['exerciseLibrary', coachId] }));

  const menu = (ex: Exercise) => [
    { key: 'use', label: t('library.use.action'), icon: 'users' as const, disabled: !canEdit, testId: 'row-use', onSelect: () => setUsing(ex) },
    { key: 'edit', label: t('common.edit'), icon: 'edit' as const, disabled: !canEdit, testId: 'row-edit', onSelect: () => setEditing(ex) },
    { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, disabled: !canEdit, testId: 'row-delete', onSelect: () => void remove(ex) },
  ];
  const sets = (ex: Exercise) => (
    <bdi dir="ltr" className="font-mono text-[12.5px] text-earth-muted">
      {ex.workingSets} × {ex.repRange || '—'}
    </bdi>
  );
  const columns: CollectionColumn<Exercise>[] = [
    { key: 'name', header: t('library.col.exercise'), sortKey: 'name', primary: true, className: 'w-[36%] xl:w-[32%]', cell: (ex) => <bdi>{ex.name || t('coachEditor.untitledExercise')}</bdi> },
    { key: 'muscle', header: t('library.col.muscle'), sortKey: 'muscle', className: 'w-[19%] xl:w-[17%]', cell: (ex) => <span className="block truncate text-earth-muted">{ex.targetMuscle ? label(ex.targetMuscle) : '—'}</span> },
    { key: 'equipment', header: t('library.col.equipment'), sortKey: 'equipment', className: 'w-[19%] xl:w-[17%]', cell: (ex) => <span className="block truncate text-earth-muted">{ex.equipment || '—'}</span> },
    { key: 'demo', header: t('library.col.demo'), sortKey: 'demo', className: 'w-[17%] xl:w-[14%]', cell: (ex) => <DemoBadge demo={exerciseDemo(ex)} /> },
    { key: 'defaults', header: t('library.col.defaults'), className: 'hidden w-[12%] xl:table-cell', cell: sets },
  ];
  const sortOptions = [
    { key: 'name' as SortKey, label: t('library.col.exercise') },
    { key: 'muscle' as SortKey, label: t('library.col.muscle') },
    { key: 'equipment' as SortKey, label: t('library.col.equipment') },
    { key: 'demo' as SortKey, label: t('library.col.demo') },
  ];
  const filtering = !!(query.q || query.muscle || query.equipment || query.video);

  return (
    <>
      <Toolbar
        hidden={all.length === 0}
        query={query}
        setQuery={setQuery}
        placeholder={t('coachLib.search')}
        searchTestId="lib-search"
        desktop={desktop}
        sorts={sortOptions}
        selecting={bulk.selecting}
        onSelecting={bulk.setSelecting}
        canSelect={canEdit && all.length > 0}
        activeFilters={[query.muscle, query.equipment, query.video].filter(Boolean).length}
        onClearFilters={() => setQuery({ muscle: '', equipment: '', video: false })}
        count={all.length ? (filtering ? t('library.countOf', { n: filtered.length, total: all.length }) : t('library.count.exercises', { count: all.length })) : null}
        filters={
          all.length > 0 ? (
            <>
              <SelectFilter value={query.muscle} onChange={(muscle) => setQuery({ muscle })} label={t('field.muscle')} anyLabel={t('coachEditor.anyMuscle')} options={muscles} testId="lib-filter-muscle" />
              <SelectFilter value={query.equipment} onChange={(equipment) => setQuery({ equipment })} label={t('field.equipment')} anyLabel={t('coachEditor.anyEquipment')} options={equipment.map((v) => ({ value: v, label: v }))} testId="lib-filter-equipment" />
              <ToggleFilter on={query.video} onChange={(video) => setQuery({ video })} label={t('library.filter.hasVideo')} testId="lib-filter-video" />
            </>
          ) : null
        }
      />
      <ListBody
        q={lib}
        total={all.length}
        matched={filtered.length}
        testId="lib-exercises"
        onClear={() => setQuery({ q: '', muscle: '', equipment: '', video: false })}
        empty={<StarterPanel createLabel={t('coachLib.newExercise')} onCreate={() => setEditing(blankExercise())} createTestId="lib-new-first" />}
      >
        {desktop ? (
          <CollectionTable
            testId="coach-desktop-library"
            caption={t('library.caption.exercises')}
            columns={columns}
            rows={shown}
            rowKey={(ex) => ex.id}
            rowName={(ex) => ex.name}
            onOpen={setViewing}
            sort={query.sort}
            dir={query.dir}
            onSort={(k) => setQuery(nextSort(query, k as SortKey))}
            selecting={bulk.selecting}
            selection={bulk.sel}
            menu={menu}
          />
        ) : (
          <CollectionList
            testId="lib-list-exercises"
            rowTestId="lib-item"
            rows={shown}
            rowKey={(ex) => ex.id}
            rowName={(ex) => ex.name}
            onOpen={setViewing}
            selecting={bulk.selecting}
            selection={bulk.sel}
            render={(ex) => {
              const demo = exerciseDemo(ex);
              const facts = [ex.targetMuscle ? label(ex.targetMuscle) : '', ex.equipment].filter(Boolean).join(' · ') || t('coachLib.noMeta');
              // Phones: the name keeps the width — "No demo yet" leads the facts line; a video / image is an icon.
              return {
                title: <bdi>{ex.name || t('coachEditor.untitledExercise')}</bdi>,
                meta:
                  demo.kind === 'none' ? (
                    <>
                      <DemoBadge demo={demo} /> · {facts}
                    </>
                  ) : (
                    facts
                  ),
                trailing: demo.kind === 'none' ? undefined : <DemoBadge demo={demo} labelled={false} />,
              };
            }}
          />
        )}
        {footer}
        <AttributionLine attribution={anyAttribution} className="mt-4 text-center" />
      </ListBody>
      {bulk.bar}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name || t('coachLib.exercise')}
        testId="exercise-detail"
        primary={
          viewing ? (
            <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="exercise-use" onClick={() => { setUsing(viewing); setViewing(null); }}>
              {t('library.use.action')}
            </Button>
          ) : null
        }
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="exercise-view-edit" onClick={() => { setEditing(viewing); setViewing(null); }}>
                {t('common.edit')}
              </Button>
              <IconButton icon="trash" label={t('library.deleteItem', { name: viewing.name })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="exercise-delete" onClick={() => void remove(viewing)} />
            </>
          ) : null
        }
      >
        {viewing && (
          <Suspense fallback={sheetFallback}>
            <ExerciseView ex={viewing} />
          </Suspense>
        )}
      </DetailSheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing && all.some((e) => e.id === editing.id) ? t('library.editExercise') : t('coachLib.newExercise')}>
        {editing && (
          <Suspense fallback={sheetFallback}>
            <ExerciseForm initial={editing} onSave={(ex) => save.mutate(ex)} pending={save.isPending} coachId={coachId} />
          </Suspense>
        )}
      </Sheet>
      <UseInPlanSheet coachId={coachId} item={using ? { kind: 'exercise', id: using.id, name: using.name } : null} onClose={() => setUsing(null)} />
    </>
  );
}
