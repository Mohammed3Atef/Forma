import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { LoadingState } from '@/components/ui/LoadingState';
import { LibraryExerciseBrowser, type ExerciseFilters } from '@/components/library/LibraryExerciseBrowser';
import { LazyCatalogExercisePreview } from '@/components/catalog/LazyCatalog';
import { blankExercise } from '@/lib/workoutPresets';
import { errorMessage } from '@/lib/errorMessage';
import { deleteExercise, getExercise, saveExercise } from '@/services/platform/coachAssetsApi';
import { LIBRARY_KEY } from '@/services/platform/libraryApi';
import type { CatalogExercise } from '@/services/platform/catalogApi';
import { useCatalogMeta } from '@/hooks/useCatalog';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { isCatalogExerciseId } from '@/lib/libraryUse';
import type { Exercise } from '@/types';
import { DetailSheet, UseInPlanSheet, useCanEdit, useSyncIssues, type SegmentProps } from './parts';

// The detail view and the form load when first opened (they are not needed to browse).
const ExerciseView = lazy(() => import('@/components/workout/ExerciseView').then((m) => ({ default: m.ExerciseView })));
const ExerciseForm = lazy(() => import('@/components/workout/ExerciseForm').then((m) => ({ default: m.ExerciseForm })));
const sheetFallback = <Skeleton className="h-64 w-full rounded-ui-surface" />;

/**
 * Library › Exercises (B4.3): ONE list — Forma's 1,343 exercises and the coach's own — searched in
 * English, Arabic and Egyptian gym words, filtered by muscle / equipment / "has a demonstration",
 * paged by the server. All · Favourites · My exercises.
 *
 * Nothing is imported first: a Forma exercise opens read-first (demonstration, steps, credits) and
 * goes straight into a client's plan. "Customise" makes the coach's own version of it (their
 * cues, media, names) — that version then replaces Forma's in their lists and plans picked from it,
 * and "Reset to Forma's version" deletes it again. The coach's own exercises are edited as before;
 * saving one still updates the templates linked to it (TS-04 notice when that part fails).
 */
export default function ExercisesSegment({ coachId, query, setQuery, createSignal, onCreateHandled, openId, onOpened }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canEdit, reason } = useCanEdit();
  const sync = useSyncIssues(coachId);
  const catalog = useCatalogMeta();
  const ar = i18n.language.startsWith('ar');

  const [shared, setShared] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Exercise | null>(null);
  const [editing, setEditing] = useState<{ ex: Exercise; title: string } | null>(null);
  const [using, setUsing] = useState<{ id: string; name: string } | null>(null);

  const filters: ExerciseFilters = { q: query.q, scope: query.scope, muscle: query.muscle, equipment: query.equipment, demo: query.demo };
  const onFilters = (f: ExerciseFilters) => setQuery({ q: f.q, scope: f.scope, muscle: f.muscle, equipment: f.equipment, demo: f.demo });

  // The header's "New exercise" (and ⌘K's) opens the form.
  useEffect(() => {
    if (createSignal <= 0) return;
    setEditing({ ex: blankExercise(), title: t('coachLib.newExercise') });
    onCreateHandled();
  }, [createSignal, onCreateHandled, t]);
  // ⌘K / a link to one exercise opens it: a Forma exercise by its catalog id, an own one fetched.
  useEffect(() => {
    if (!openId) return;
    if (isCatalogExerciseId(openId)) setShared(openId);
    else void getExercise(coachId, openId).then(setViewing, () => undefined);
    onOpened();
  }, [openId, coachId, onOpened]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
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
      if (res.status !== 'failed') showToast({ title: t('common.saved'), body: res.affectedTemplates > 0 ? t('coachLib.templatesUpdated', { count: res.affectedTemplates }) : undefined, variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: editing?.title ?? t('coachLib.newExercise'), message: errorMessage(e, t, 'common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteExercise(coachId, id),
    onSuccess: (_v, id) => {
      setViewing(null);
      invalidate();
      showToast({ title: id.startsWith('cat-') ? t('library.resetDone') : t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (ex: Exercise) => {
    const reset = !!ex.catalogId;
    const ok = await confirmDialog(
      reset
        ? { title: t('library.reset'), message: t('library.resetConfirm', { name: ex.name }), confirmLabel: t('library.reset') }
        : { title: t('common.delete'), message: t('common.confirmDeleteName', { name: ex.name }), danger: true, confirmLabel: t('common.delete') },
    );
    if (ok) del.mutate(ex.id);
  };
  const customize = async (e: CatalogExercise) => {
    const { exerciseFromCatalog } = await import('@/lib/catalogCopy'); // loads with the first customisation
    setShared(null);
    setEditing({ ex: { ...exerciseFromCatalog(e, catalog.taxonomy!), id: `cat-${e.id}` }, title: t('library.customizeTitle', { name: ar ? e.name.ar || e.name.en : e.name.en }) });
  };

  if (!catalog.taxonomy) return <LoadingState count={4} />;
  const taxonomy = catalog.taxonomy;

  return (
    <>
      <LibraryExerciseBrowser
        taxonomy={taxonomy}
        filters={filters}
        onFilters={onFilters}
        onOpen={(r) => (r.kind === 'shared' ? setShared(r.id) : setViewing(r.exercise as unknown as Exercise))}
        emptyMine={
          <Button icon="plus" disabled={!canEdit} title={reason} onClick={() => setEditing({ ex: blankExercise(), title: t('coachLib.newExercise') })} data-testid="lib-new-first">
            {t('coachLib.newExercise')}
          </Button>
        }
        testId="lib-exercises"
      />

      {/* A Forma exercise: read-first, then use it or make it your own. */}
      <Sheet open={!!shared} onClose={() => setShared(null)} size="lg" title={t('catalog.preview')}>
        {shared && (
          <LazyCatalogExercisePreview
            id={shared}
            taxonomy={taxonomy}
            actions={(e) => (
              <div className="space-y-2">
                <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="exercise-use" onClick={() => { setShared(null); setUsing({ id: e.id, name: ar ? e.name.ar || e.name.en : e.name.en }); }}>
                  {t('library.use.action')}
                </Button>
                <Button variant="secondary" icon="edit" fullWidth disabled={!canEdit} title={reason} data-testid="catalog-customize" onClick={() => void customize(e)}>
                  {t('library.customize')}
                </Button>
              </div>
            )}
          />
        )}
      </Sheet>

      {/* The coach's own exercise (or their version of a Forma one). */}
      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name || t('coachLib.exercise')}
        testId="exercise-detail"
        primary={
          viewing ? (
            <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="exercise-use" onClick={() => { setUsing({ id: viewing.id, name: viewing.name }); setViewing(null); }}>
              {t('library.use.action')}
            </Button>
          ) : null
        }
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="exercise-view-edit" onClick={() => { setEditing({ ex: viewing, title: t('library.editExercise') }); setViewing(null); }}>
                {t('common.edit')}
              </Button>
              {viewing.catalogId ? (
                <Button variant="ghost" icon="rotate" disabled={!canEdit || del.isPending} title={reason} data-testid="exercise-reset" onClick={() => void remove(viewing)}>
                  {t('library.reset')}
                </Button>
              ) : (
                <IconButton icon="trash" label={t('library.deleteItem', { name: viewing.name })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="exercise-delete" onClick={() => void remove(viewing)} />
              )}
            </>
          ) : null
        }
      >
        {viewing && (
          <Suspense fallback={sheetFallback}>
            {viewing.catalogId && (
              <p className="mb-3 text-[12.5px] text-earth-subtle" data-testid="exercise-customized-note">
                {t('library.customizedNote')}
              </p>
            )}
            <ExerciseView ex={viewing} />
          </Suspense>
        )}
      </DetailSheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} size="lg" title={editing?.title ?? ''}>
        {editing && (
          <Suspense fallback={sheetFallback}>
            <ExerciseForm initial={editing.ex} onSave={(ex) => save.mutate(ex)} pending={save.isPending} coachId={coachId} />
          </Suspense>
        )}
      </Sheet>
      <UseInPlanSheet coachId={coachId} item={using ? { kind: 'exercise', ...using } : null} onClose={() => setUsing(null)} />
    </>
  );
}
