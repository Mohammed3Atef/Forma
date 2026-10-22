import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFreshDraft } from '@/lib/draft';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { SelectField, TextInput } from '@/components/ui/Field';
import { showToast } from '@/stores/toastStore';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { PlanEditorShell } from '@/components/coach/editor/PlanEditorShell';
import { TrainingBuilder } from '@/components/coach/editor/TrainingBuilder';
import { TemplateReadView } from '@/components/coach/editor/TemplateReadView';
import { AssignTemplateSheet } from '@/components/coach/AssignTemplate';
import { useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import { confirmLeave } from '@/stores/navGuardStore';
import { uid } from '@/lib/utils';
import { normalizeWorkoutBody, serializeWorkoutBody } from '@/lib/workoutPlanModel';
import { deleteWorkoutTemplate, duplicateWorkoutTemplate, getWorkoutTemplate, saveWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import type { SplitType, WorkoutGoal, WorkoutTemplate } from '@/types';
import { errorMessage } from '@/lib/errorMessage';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];
/** Library › Programs — where a program's Back leads when there is nothing to go back to. */
export const PROGRAMS = '/coach/library?tab=programs';
const readPath = (id: string) => `/coach/templates/${encodeURIComponent(id)}`;

function blankTemplate(coachId: string): WorkoutTemplate {
  const now = 0; // stamped on save
  return { id: uid('wtpl'), coachId, name: '', goal: 'hypertrophy', splitType: 'ppl', days: [], exercises: {}, createdAt: now, updatedAt: now };
}

/**
 * A coach's workout template — one screen, two modes (B3.7, RM-27):
 *  - `/coach/templates/:id` opens it READ-FIRST: the whole program, with an explicit Edit and
 *    "Use in a client plan" (the old preview page, which showed counts only, is gone);
 *  - `/coach/templates/:id/edit` and `/coach/templates/new` are the builder (B3.5): the plan
 *    editors' frame, the shared unsaved-changes guard on every exit (B3-C01, NAV-K05) and a draft
 *    per coach and template.
 * A template that fails to load is an error with Retry — never a blank template (C1). Templates
 * stay last-write-wins (O-13). Edit, Save and Back replace the entry in history, so Back from the
 * program goes to the Library and never into the builder (NAV-K04).
 */
export function CoachWorkoutTemplateEditor() {
  const { templateId = 'new' } = useParams();
  const { pathname } = useLocation();
  const isNew = templateId === 'new';
  return !isNew && !pathname.replace(/\/+$/, '').endsWith('/edit') ? <TemplateRead templateId={templateId} /> : <TemplateEdit templateId={templateId} isNew={isNew} />;
}

// ---- read-first ------------------------------------------------------------------------------------

function TemplateRead({ templateId }: { templateId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const { canWrite } = useCoachPlan();
  const online = useOnlineStatus();
  const canEdit = canWrite && online;
  const goBack = useBack(PROGRAMS);
  const [assigning, setAssigning] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const query = useQuery({ queryKey: ['workoutTemplate', coachId, templateId], queryFn: () => getWorkoutTemplate(coachId, templateId), enabled: !!coachId });
  const tpl = query.data ?? null;

  // Unsaved edits from an earlier visit are never hidden: say so, and Edit brings them back.
  useEffect(() => {
    if (!coachId || !tpl) return;
    void draftStore.getItem<WorkoutTemplate>(`workoutTemplateDraft:${coachId}:${templateId}`).then((d) => setHasDraft(!!(d && pickFreshDraft(d, tpl))));
  }, [coachId, templateId, tpl]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachTemplatesCount', coachId] });
  };
  const dup = useMutation({
    mutationFn: () => duplicateWorkoutTemplate(tpl!),
    onSuccess: (copy) => {
      invalidate();
      showToast({ title: t('library.duplicated'), variant: 'success' });
      navigate(readPath(copy.id), { replace: true });
    },
    onError: (e) => void alertDialog({ title: t('workoutTemplate.duplicate'), message: errorMessage(e, t) }),
  });
  const del = useMutation({
    mutationFn: () => deleteWorkoutTemplate(coachId, templateId),
    onSuccess: () => {
      invalidate();
      showToast({ title: t('common.removed'), variant: 'success' });
      navigate(PROGRAMS, { replace: true });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async () => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: tpl?.name || t('workoutTemplate.untitled') }), danger: true, confirmLabel: t('common.delete') })) del.mutate();
  };
  const edit = () => navigate(`${readPath(templateId)}/edit`, { replace: true });

  const title = tpl ? tpl.name || t('workoutTemplate.untitled') : t('library.program.label');
  return (
    <PlanEditorShell
      testId="coach-template-editor"
      prefix="template"
      title={title}
      subtitle={tpl ? t('library.program.label') : undefined}
      onBack={goBack}
      menu={
        tpl
          ? [
              { key: 'dup', label: t('workoutTemplate.duplicate'), icon: 'copy', disabled: !canEdit || dup.isPending, testId: 'template-duplicate', onSelect: () => dup.mutate() },
              { key: 'del', label: t('common.delete'), icon: 'trash', danger: true, disabled: !canEdit || del.isPending, testId: 'template-delete', onSelect: () => void remove() },
            ]
          : undefined
      }
    >
      {query.isError ? (
        <ErrorState message={t('workoutTemplate.loadFailed')} onRetry={() => void query.refetch()} testId="template-load-error" />
      ) : query.isSuccess && !tpl ? (
        <p className="py-10 text-center text-sm text-earth-muted" data-testid="template-not-found">
          {t('workoutTemplate.notFound')}
        </p>
      ) : !tpl ? (
        <LoadingState variant="list" count={4} />
      ) : (
        <TemplateReadView
          body={tpl}
          details={
            <div className="space-y-3">
              <p className="text-[13.5px] text-earth-muted">
                {t(`workoutTemplate.goals.${tpl.goal}`)} · {t(`workoutTemplate.splits.${tpl.splitType}`)} · {t('coachEditor.dayCount', { n: tpl.days.length })}
              </p>
              {hasDraft ? (
                <p className="rounded-ui-control border border-line bg-surface-raised px-3 py-2 text-[13px] text-earth-muted" role="status" data-testid="template-draft-pending">
                  {t('library.program.draftPending')}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button icon="edit" data-testid="template-edit" disabled={!canEdit} title={!canEdit ? (online ? t('library.planLapsed') : t('offline.actionDisabled')) : undefined} onClick={edit}>
                  {hasDraft ? t('library.program.continueEditing') : t('common.edit')}
                </Button>
                <Button variant="secondary" icon="users" data-testid="template-assign" disabled={!canEdit} onClick={() => setAssigning(true)}>
                  {t('library.use.action')}
                </Button>
              </div>
            </div>
          }
        />
      )}
      <AssignTemplateSheet template={assigning ? tpl : null} coachId={coachId} onClose={() => setAssigning(false)} />
    </PlanEditorShell>
  );
}

// ---- the builder -----------------------------------------------------------------------------------

function TemplateEdit({ templateId, isNew }: { templateId: string; isNew: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const isDesktop = useIsDesktop();
  const draftKey = `workoutTemplateDraft:${coachId}:${templateId}`;

  const query = useQuery({
    queryKey: ['workoutTemplate', coachId, templateId],
    queryFn: () => getWorkoutTemplate(coachId, templateId),
    enabled: !isNew && !!coachId,
  });
  const [tpl, setTpl] = useState<WorkoutTemplate | null>(null);
  const [dayId, setDayId] = useState<string | null>(null);
  const selectDay = useCallback((id: string | null) => setDayId(id), []);
  // Baseline = the saved template in the editor's working shape; a restored draft is a real edit.
  const baselineRef = useRef<string>('');

  const missing = !isNew && query.isSuccess && !query.data;
  useEffect(() => {
    if (tpl !== null || !coachId || (!isNew && !query.data)) return;
    const savedTpl = isNew ? blankTemplate(coachId) : query.data!;
    void draftStore.getItem<WorkoutTemplate>(draftKey).then((draft) => {
      const saved = normalizeWorkoutBody(savedTpl);
      baselineRef.current = JSON.stringify(saved);
      const fresh = draft ? (isNew ? draft : pickFreshDraft(draft, savedTpl)) : null; // stale drafts are dropped (lib/draft.ts)
      setTpl(fresh ? normalizeWorkoutBody(fresh) : saved);
    });
  }, [isNew, query.data, tpl, draftKey, coachId]);

  const dirty = tpl !== null && JSON.stringify(tpl) !== baselineRef.current;
  useEffect(() => {
    if (tpl && dirty) void draftStore.setItem(draftKey, tpl);
  }, [tpl, dirty, draftKey]);
  const discardDraft = useCallback(() => void draftStore.removeItem(draftKey), [draftKey]);
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') }, discardDraft);

  const save = useMutation({
    mutationFn: () => saveWorkoutTemplate(serializeWorkoutBody(tpl!)),
    onSuccess: async () => {
      await draftStore.removeItem(draftKey);
      baselineRef.current = JSON.stringify(tpl);
      void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
      void qc.invalidateQueries({ queryKey: ['workoutTemplate', coachId, tpl!.id] });
      void qc.invalidateQueries({ queryKey: ['coachTemplatesCount', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      navigate(readPath(tpl!.id), { replace: true }); // the program, read-first, in place of the builder
    },
  });

  const exit = async () => {
    if (!isDesktop && dayId && tpl) {
      setDayId(null);
      return;
    }
    if (!(await confirmLeave())) return; // the shared guard (Leave discards the draft)
    navigate(isNew ? PROGRAMS : readPath(templateId), { replace: true });
  };

  const title = isNew ? t('library.newProgram') : t('library.program.editTitle');
  if (!tpl) {
    return (
      <PlanEditorShell testId="coach-template-editor" prefix="template" title={title} onBack={() => void exit()}>
        {!isNew && query.isError ? (
          <ErrorState message={t('workoutTemplate.loadFailed')} onRetry={() => void query.refetch()} testId="template-load-error" />
        ) : missing ? (
          <p className="py-10 text-center text-sm text-earth-muted" data-testid="template-not-found">
            {t('workoutTemplate.notFound')}
          </p>
        ) : (
          <LoadingState variant="list" count={4} />
        )}
      </PlanEditorShell>
    );
  }

  const patch = (p: Partial<WorkoutTemplate>) => setTpl((cur) => (cur ? { ...cur, ...p } : cur));
  const details = (
    <div className="space-y-3">
      <TextInput label={t('field.name')} data-testid="template-name" value={tpl.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t('workoutTemplate.namePlaceholder')} dir="auto" />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label={t('workoutTemplate.goal')} data-testid="template-goal" value={tpl.goal} onChange={(e) => patch({ goal: e.target.value as WorkoutGoal })}>
          {GOALS.map((g) => (
            <option key={g} value={g}>
              {t(`workoutTemplate.goals.${g}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('workoutTemplate.split')} data-testid="template-split" value={tpl.splitType} onChange={(e) => patch({ splitType: e.target.value as SplitType })}>
          {SPLITS.map((s) => (
            <option key={s} value={s}>
              {t(`workoutTemplate.splits.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );

  return (
    <PlanEditorShell
      testId="coach-template-editor"
      prefix="template"
      title={title}
      subtitle={!isNew && tpl.name ? tpl.name : undefined}
      onBack={() => void exit()}
      state={{ saving: save.isPending, dirty, justSaved: false, conflict: false, saveFailed: save.isError, canSave: !save.isPending && tpl.name.trim().length > 0 }}
      onSave={() => save.mutate()}
      saveLabel={t('common.save')}
    >
      <div data-testid="coach-desktop-plan-builder">
        <TrainingBuilder body={tpl} onChange={(b) => patch({ days: b.days, exercises: b.exercises })} coachId={coachId} details={details} selectedDayId={dayId} onSelectDay={selectDay} />
      </div>
    </PlanEditorShell>
  );
}
