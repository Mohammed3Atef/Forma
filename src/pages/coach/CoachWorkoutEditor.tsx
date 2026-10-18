import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { PlanConflictBanner, PlanEditorGate } from '@/components/coach/PlanEditorStates';
import { usePlanEditor } from '@/hooks/usePlanEditor';
import { Sheet } from '@/components/Sheet';
import { TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { showToast } from '@/stores/toastStore';
import { PlanBuilder } from '@/components/workout/PlanBuilder';
import { VersionActions } from '@/components/coach/VersionActions';
import { ClientContextPanel } from '@/components/coach/ClientContextPanel';
import { useSession } from '@/services/auth/sessionStore';
import { uid } from '@/lib/utils';
import { getClientWorkoutPlan, saveClientWorkoutPlan } from '@/services/platform/planApi';
import { saveClientPlanAsTemplate } from '@/services/platform/coachAssetsApi';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useBack } from '@/hooks/useBack';
import type { Exercise, SplitType, WorkoutDay, WorkoutGoal, WorkoutPlan } from '@/types';

const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function emptyPlan(): WorkoutPlan {
  return { id: uid('wplan'), name: '', days: [], exercises: {}, updatedAt: Date.now() };
}

export function CoachWorkoutEditor() {
  const { t } = useTranslation();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const ed = usePlanEditor<WorkoutPlan>({
    queryKey: 'clientWorkoutPlan',
    clientId,
    draftKey: `workoutDraft:${coachId}:${clientId}`,
    load: getClientWorkoutPlan,
    // Editing an assigned (from-template) plan marks it customized.
    save: (id, p, opts) => saveClientWorkoutPlan(id, p.meta ? { ...p, meta: { ...p.meta, isCustomized: true } } : p, opts),
    empty: emptyPlan,
  });
  const { plan, setPlan, dirty, save } = ed;
  const [asTemplate, setAsTemplate] = useState(false);
  // Registers this dirty state with the shared nav guard, so leaving via the
  // workspace's own back button, tab rail, or bottom nav also confirms first.
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') }, ed.discardDraft);

  // Goes through the same guard, prefers real back over always landing on the
  // overview tab, and only clears the draft once the exit is actually confirmed.
  // B3.4: an editor opened cold goes back to the client's Plan (its semantic parent).
  const exit = useBack(`/coach/client/${clientId}/plan`, ed.discardDraft);

  if (!plan) {
    return (
      <>
        <TopBar testId="coach-workout-editor" title={t('coachEditor.workoutTitle')} dense onBack={exit} />
        {ed.status !== 'ready' && <PlanEditorGate status={ed.status} kind="workout" onRetry={ed.retry} onCreate={ed.startNew} />}
      </>
    );
  }

  const canSave = ed.canSave && plan.name.trim().length > 0;
  const change = (days: WorkoutDay[], exercises: Record<string, Exercise>) => setPlan((p) => ({ ...p, days, exercises }));

  const header = (
    <div className="space-y-2">
      <ClientContextPanel clientId={clientId} />
      {ed.conflict ? (
        <PlanConflictBanner pending={save.isPending} onLoadLatest={() => void ed.reloadLatest()} onKeepMine={() => save.mutate({ overwrite: true })} />
      ) : save.isError ? (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert" data-testid="plan-editor-save-failed">{t('trust.planEditor.saveFailed')}</p>
      ) : null}
      {plan.meta?.sourceTemplateName && (
        <p className="text-[12px] text-earth-subtle">
          {t('coachEditor.fromTemplate', { name: plan.meta.sourceTemplateName })}
          {plan.meta.isCustomized ? ` · ${t('coachEditor.customized')}` : ''}
        </p>
      )}
      <TextInput
        label={t('field.planName')}
        data-testid="workout-plan-name"
        value={plan.name}
        onChange={(e) => setPlan({ ...plan, name: e.target.value })}
        placeholder={t('coachEditor.planNamePlaceholder')}
      />
      <div className="flex items-center justify-between">
        {save.isPending ? (
          <p className="text-[12px] text-earth-subtle" data-testid="workout-saving">{t('settings.saving')}</p>
        ) : dirty ? (
          <p className="text-[12px] text-warn" data-testid="workout-unsaved">{t('coachEditor.unsavedIndicator')}</p>
        ) : ed.justSaved ? (
          <p className="text-[12px] text-success" data-testid="workout-saved">{t('trust.planEditor.savedVersioned')}</p>
        ) : <span />}
        <button type="button" className="chip" data-testid="save-as-template" onClick={() => setAsTemplate(true)}>
          {t('coachEditor.saveAsTemplate')}
        </button>
      </div>
      <p className="text-[11.5px] text-earth-subtle">{t('trust.planEditor.saveHint')}</p>
      <VersionActions clientId={clientId} kind="workout" pending={save.isPending} onSaveVersion={(reason) => save.mutateAsync({ reason })} />
    </div>
  );

  return (
    <>
      <TopBar
        testId="coach-workout-editor"
        title={t('coachEditor.workoutTitle')}
        dense
        onBack={exit}
        right={
          <SubmitButton type="button" data-testid="workout-save" pending={save.isPending} disabled={!canSave} className="h-[42px] px-4 text-xs" onClick={() => save.mutate({})}>
            {t('coachEditor.saveAssigned')}
          </SubmitButton>
        }
      />
      <PlanBuilder days={plan.days} exercises={plan.exercises} onChange={change} coachId={coachId} clientId={clientId} header={header} />
      <Sheet open={asTemplate} onClose={() => setAsTemplate(false)} size="md" title={t('coachEditor.saveAsTemplate')}>
        <SaveAsTemplateForm coachId={coachId} plan={plan} onDone={() => setAsTemplate(false)} />
      </Sheet>
    </>
  );
}

function SaveAsTemplateForm({ coachId, plan, onDone }: { coachId: string; plan: WorkoutPlan; onDone: () => void }) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState<WorkoutGoal>('hypertrophy');
  const [split, setSplit] = useState<SplitType>('ppl');
  const [saveError, setSaveError] = useState(false);
  const mut = useMutation({
    mutationFn: () => saveClientPlanAsTemplate(coachId, plan, name.trim(), goal, split),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
      void qc.invalidateQueries({ queryKey: ['coachTemplatesCount', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      onDone();
    },
    onError: () => setSaveError(true),
  });
  return (
    <div className="space-y-3">
      <TextInput label={t('field.name')} data-testid="template-from-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('workoutTemplate.namePlaceholder')} />
      <div>
        <div className="label mb-1.5">{t('workoutTemplate.goal')}</div>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button key={g} type="button" className={`chip ${goal === g ? 'chip-on' : ''}`} onClick={() => setGoal(g)}>
              {t(`workoutTemplate.goals.${g}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1.5">{t('workoutTemplate.split')}</div>
        <div className="flex flex-wrap gap-2">
          {SPLITS.map((s) => (
            <button key={s} type="button" className={`chip ${split === s ? 'chip-on' : ''}`} onClick={() => setSplit(s)}>
              {t(`workoutTemplate.splits.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {saveError && <p role="alert" className="text-sm text-danger">{t('common.savedFailed')}</p>}
      <SubmitButton type="button" disabled={!name.trim()} pending={mut.isPending} onClick={() => mut.mutate()} fullWidth>
        {t('common.save')}
      </SubmitButton>
    </div>
  );
}
