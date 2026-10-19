import { useCallback, useEffect, useRef, useState } from 'react';
import { pickFreshDraft } from '@/lib/draft';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SelectField, TextInput } from '@/components/ui/Field';
import { showToast } from '@/stores/toastStore';
import { PlanEditorShell } from '@/components/coach/editor/PlanEditorShell';
import { TrainingBuilder } from '@/components/coach/editor/TrainingBuilder';
import { useSession } from '@/services/auth/sessionStore';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { confirmLeave } from '@/stores/navGuardStore';
import { uid } from '@/lib/utils';
import { normalizeWorkoutBody, serializeWorkoutBody } from '@/lib/workoutPlanModel';
import { getWorkoutTemplate, saveWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import type { SplitType, WorkoutGoal, WorkoutTemplate } from '@/types';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function blankTemplate(coachId: string): WorkoutTemplate {
  const now = 0; // stamped on save
  return { id: uid('wtpl'), coachId, name: '', goal: 'hypertrophy', splitType: 'ppl', days: [], exercises: {}, createdAt: now, updatedAt: now };
}

/**
 * A coach's workout template (B3.5): the plan editors' builder and frame, the shared unsaved-changes
 * guard on every exit (B3-C01, NAV-K05) and a draft per coach and template. A template that fails
 * to load is an error with Retry — never a blank template to fill in (C1). Templates stay
 * last-write-wins (O-13). Save and Back replace the editor in history, so Back from the preview
 * never returns into it (NAV-K04).
 */
export function CoachWorkoutTemplateEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { templateId = 'new' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const isDesktop = useIsDesktop();
  const isNew = templateId === 'new';
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
      showToast({ title: t('common.saved'), variant: 'success' });
      navigate(`/coach/templates/${tpl!.id}`, { replace: true }); // the read-only preview, in place of the editor
    },
  });

  const exit = async () => {
    if (!isDesktop && dayId && tpl) {
      setDayId(null);
      return;
    }
    if (!(await confirmLeave())) return; // the shared guard (Leave discards the draft)
    navigate(isNew ? '/coach/templates' : `/coach/templates/${templateId}`, { replace: true });
  };

  const title = t('workoutTemplate.editorTitle');
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
