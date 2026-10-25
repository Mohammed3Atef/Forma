import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlanEditorGate } from '@/components/coach/PlanEditorStates';
import { PlanEditorShell } from '@/components/coach/editor/PlanEditorShell';
import { PlanHistorySheet } from '@/components/coach/editor/PlanHistorySheet';
import { useHistoryParam } from '@/components/coach/editor/useHistoryParam';
import { TrainingBuilder } from '@/components/coach/editor/TrainingBuilder';
import { LibraryAddPrompt } from '@/components/coach/editor/LibraryAddPrompt';
import { usePlanEditor } from '@/hooks/usePlanEditor';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { SelectField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { showToast } from '@/stores/toastStore';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { useSession } from '@/services/auth/sessionStore';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { uid } from '@/lib/utils';
import { knownKind, normalizeWorkoutBody, serializeWorkoutBody } from '@/lib/workoutPlanModel';
import { ADD_EXERCISE_PARAM, addLibraryExercise, exerciseTargets } from '@/lib/libraryHandoff';
import { getClientWorkoutPlan, saveClientWorkoutPlan } from '@/services/platform/planApi';
import { saveClientPlanAsTemplate } from '@/services/platform/coachAssetsApi';
import { catalogMetaQuery } from '@/services/platform/catalogApi';
import { exerciseForPlan } from '@/lib/libraryUse';
import { exerciseDisplayName } from '@/lib/catalogText';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import { useHandoffParam } from '@/hooks/useHandoffParam';
import type { SplitType, WorkoutGoal, WorkoutPlan } from '@/types';

const notFound = (e: unknown) => (e as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND';

const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function emptyPlan(): WorkoutPlan {
  return { id: uid('wplan'), name: '', days: [], exercises: {}, updatedAt: Date.now() };
}

/**
 * A client's training plan (B3.5, blueprint §6.4). The load gate, compare-and-set saves, drafts
 * and the unsaved-changes guard are `usePlanEditor` / `useUnsavedGuard` (contracts C1–C4); older
 * plans open unchanged (B34-R1, `lib/workoutPlanModel`).
 */
export function CoachWorkoutEditor() {
  const { t, i18n } = useTranslation();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const client = useCoachClientHeader(clientId);
  const isDesktop = useIsDesktop();
  const navigate = useGuardedNav();
  const dirtyRef = useRef(false);
  const ed = usePlanEditor<WorkoutPlan>({
    queryKey: 'clientWorkoutPlan',
    clientId,
    draftKey: `workoutDraft:${coachId}:${clientId}`,
    load: getClientWorkoutPlan,
    // Editing an assigned (from-template) plan marks it customized — only when something changed.
    save: (id, p, opts) => saveClientWorkoutPlan(id, p.meta && dirtyRef.current ? { ...p, meta: { ...p.meta, isCustomized: true } } : p, opts),
    empty: emptyPlan,
    normalize: normalizeWorkoutBody,
    serialize: serializeWorkoutBody,
  });
  const { plan, setPlan, dirty, save } = ed;
  dirtyRef.current = dirty;
  const [asTemplate, setAsTemplate] = useState(false);
  const [history, setHistory] = useHistoryParam(); // B3.9 (D10): ?history=1 opens it
  const [dayId, setDayId] = useState<string | null>(null);
  const selectDay = useCallback((id: string | null) => setDayId(id), []);
  // B3.7 "Use in a client plan": an exercise handed over from the Library, added only once the coach
  // picks the day — as an unsaved change (the plan is saved, as always, by Save).
  const qc = useQueryClient();
  const [addId, clearAdd] = useHandoffParam(ADD_EXERCISE_PARAM);
  // B4.3: a Forma exercise (catalog id) arrives as its snapshot; the coach's own one is library-linked.
  const addQ = useQuery({
    queryKey: ['exerciseLibraryItem', coachId, addId],
    queryFn: () => exerciseForPlan(coachId, addId!, async () => (await qc.fetchQuery(catalogMetaQuery())).taxonomy),
    enabled: !!addId && !!coachId,
    retry: (n, e) => !notFound(e) && n < 2,
    staleTime: Infinity,
  });
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') }, ed.discardDraft);
  // An editor opened cold goes back to the client's Plan (its semantic parent); the draft is only
  // cleared once leaving is confirmed.
  const exit = useBack(`/coach/client/${clientId}/plan`, ed.discardDraft);
  // Phones: the one Back steps from a day up to the plan before it leaves the editor.
  const onBack = !isDesktop && dayId && plan ? () => setDayId(null) : exit;

  const title = t('coachEditor.workoutTitle');
  if (!plan) {
    return (
      <PlanEditorShell testId="coach-workout-editor" prefix="workout" title={title} subtitle={client.name} onBack={exit}>
        {ed.status !== 'ready' && <PlanEditorGate status={ed.status} kind="workout" onRetry={ed.retry} onCreate={ed.startNew} onFromTemplate={() => navigate('/coach/library?tab=programs')} />}
      </PlanEditorShell>
    );
  }

  const details = (
    <div className="space-y-3" data-testid="workout-plan-details">
      <TextInput label={t('field.planName')} data-testid="workout-plan-name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.planNamePlaceholder')} dir="auto" />
      {plan.meta?.sourceTemplateName && (
        <p className="text-[12.5px] text-earth-subtle">
          {t('coachEditor.fromTemplate', { name: plan.meta.sourceTemplateName })}
          {plan.meta.isCustomized ? ` · ${t('coachEditor.customized')}` : ''}
        </p>
      )}
      <ClientContextPanel clientId={clientId} />
    </div>
  );

  return (
    <PlanEditorShell
      testId="coach-workout-editor"
      prefix="workout"
      title={title}
      subtitle={client.name}
      onBack={onBack}
      state={{ saving: save.isPending, dirty, justSaved: ed.justSaved, conflict: ed.conflict, saveFailed: save.isError, canSave: ed.canSave && plan.name.trim().length > 0 }}
      onSave={() => save.mutate({})}
      conflict={{ onLoadLatest: () => void ed.reloadLatest(), onKeepMine: () => save.mutate({ overwrite: true }) }}
      draftRestored={ed.draftRestored}
      draftStale={ed.draftStale}
      onDiscardDraft={() => void ed.revertToSaved()}
      headerActions={
        <Button variant="ghost" size="sm" icon="list" data-testid="version-history" onClick={() => setHistory(true)}>
          <span className="hidden sm:inline">{t('planVersions.history')}</span>
          <span className="sr-only sm:hidden">{t('planVersions.history')}</span>
        </Button>
      }
      menu={[{ key: 'template', label: t('coachEditor.saveAsTemplate'), icon: 'copy', testId: 'save-as-template', onSelect: () => setAsTemplate(true) }]}
    >
      <TrainingBuilder body={plan} onChange={(b) => setPlan((cur) => ({ ...cur, days: b.days, exercises: b.exercises }))} coachId={coachId} details={details} selectedDayId={dayId} onSelectDay={selectDay} />
      <LibraryAddPrompt
        open={!!addId && (addQ.isSuccess || addQ.isError)}
        testId="library-add"
        title={addQ.data ? t('library.add.exerciseTitle', { name: exerciseDisplayName(addQ.data.exercise, i18n.language) }) : t('library.use.action')}
        hint={t('library.add.exerciseHint', { name: client.name })}
        newLabel={t('library.add.newDay')}
        missing={addQ.isError ? t(notFound(addQ.error) ? 'library.add.exerciseMissing' : 'library.add.loadFailed') : null}
        targets={exerciseTargets(plan).map((tg) => ({
          key: JSON.stringify([tg.dayId, tg.sectionId]),
          title: (
            <bdi>
              {tg.dayTitle || t('coachEditor.day')}
              {tg.sectionTitle !== null ? ` › ${tg.sectionTitle || t(`coachEditor.sectionKinds.${knownKind(tg.sectionKind)}`)}` : ''}
            </bdi>
          ),
          meta: t('coachEditor.exercisesCount', { count: tg.count }),
        }))}
        onCancel={clearAdd}
        onPick={(key) => {
          const picked = addQ.data;
          if (!picked) return;
          const target = key ? (([dayId, sectionId]) => ({ dayId, sectionId }))(JSON.parse(key) as [string, string]) : { newDayTitle: `${t('coachEditor.day')} ${plan.days.length + 1}` };
          const res = addLibraryExercise(plan, target, picked.exercise, picked.linked);
          setPlan((cur) => ({ ...cur, days: res.body.days, exercises: res.body.exercises }));
          setDayId(res.dayId);
          clearAdd();
        }}
      />
      <PlanHistorySheet
        open={history}
        onClose={() => setHistory(false)}
        clientId={clientId}
        kind="workout"
        dirty={dirty}
        saving={save.isPending}
        canSave={ed.canSave && plan.name.trim().length > 0}
        onSaveVersion={(reason) => save.mutateAsync({ reason })}
        onRestored={() => ed.reloadLatest()}
      />
      <Sheet open={asTemplate} onClose={() => setAsTemplate(false)} size="md" title={t('coachEditor.saveAsTemplate')}>
        <SaveAsTemplateForm coachId={coachId} plan={serializeWorkoutBody(plan)} onDone={() => setAsTemplate(false)} />
      </Sheet>
    </PlanEditorShell>
  );
}

function SaveAsTemplateForm({ coachId, plan, onDone }: { coachId: string; plan: WorkoutPlan; onDone: () => void }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState<WorkoutGoal>('hypertrophy');
  const [split, setSplit] = useState<SplitType>('ppl');
  const mut = useMutation({
    mutationFn: () => saveClientPlanAsTemplate(coachId, plan, name.trim(), goal, split),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
      void qc.invalidateQueries({ queryKey: ['coachTemplatesCount', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      onDone();
    },
  });
  return (
    <div className="space-y-3">
      <TextInput label={t('field.name')} data-testid="template-from-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('workoutTemplate.namePlaceholder')} dir="auto" />
      <SelectField label={t('workoutTemplate.goal')} value={goal} onChange={(e) => setGoal(e.target.value as WorkoutGoal)}>
        {GOALS.map((g) => (
          <option key={g} value={g}>
            {t(`workoutTemplate.goals.${g}`)}
          </option>
        ))}
      </SelectField>
      <SelectField label={t('workoutTemplate.split')} value={split} onChange={(e) => setSplit(e.target.value as SplitType)}>
        {SPLITS.map((s) => (
          <option key={s} value={s}>
            {t(`workoutTemplate.splits.${s}`)}
          </option>
        ))}
      </SelectField>
      {mut.isError && (
        <p role="alert" className="text-sm text-danger">
          {t('common.savedFailed')}
        </p>
      )}
      <SubmitButton type="button" disabled={!name.trim()} pending={mut.isPending} onClick={() => mut.mutate()} fullWidth>
        {t('common.save')}
      </SubmitButton>
    </div>
  );
}
