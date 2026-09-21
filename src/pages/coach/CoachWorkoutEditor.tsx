import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
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

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function emptyPlan(): WorkoutPlan {
  return { id: uid('wplan'), name: '', days: [], exercises: {}, updatedAt: Date.now() };
}

export function CoachWorkoutEditor() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const draftKey = `workoutDraft:${clientId}`;

  const query = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  // Dirty is COMPUTED vs the last-saved baseline (not a sticky flag), so a
  // leftover draft identical to the saved plan doesn't trigger a false prompt.
  const baselineRef = useRef<string>('');
  const [asTemplate, setAsTemplate] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (plan !== null || query.isLoading) return;
    void draftStore.getItem<WorkoutPlan>(draftKey).then((draft) => {
      const base = query.data ?? emptyPlan();
      baselineRef.current = JSON.stringify(base);
      setPlan(draft ?? base);
    });
  }, [query.isLoading, query.data, plan, draftKey]);

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;
  // Registers this dirty state with the shared nav guard, so leaving via the
  // workspace's own back button, tab rail, or bottom nav also confirms first —
  // not just this editor's own `exit()` (its back button already confirms via
  // `exit`; this covers every OTHER way to leave the page).
  useUnsavedGuard(dirty, { title: t('coachEditor.unsavedTitle'), body: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave') });

  // Autosave draft locally while there are unsaved changes.
  useEffect(() => {
    if (plan && dirty) void draftStore.setItem(draftKey, plan);
  }, [plan, dirty, draftKey]);

  const save = useMutation({
    mutationFn: () => {
      const p = plan!;
      // Editing an assigned (from-template) plan marks it customized.
      const next = p.meta ? { ...p, meta: { ...p.meta, isCustomized: true } } : p;
      return saveClientWorkoutPlan(clientId, next);
    },
    onSuccess: async () => {
      await draftStore.removeItem(draftKey);
      baselineRef.current = JSON.stringify(plan);
      void qc.invalidateQueries({ queryKey: ['clientWorkoutPlan', clientId] });
      showToast({ title: t('common.saved'), variant: 'success' });
      // Stays on the editor — the client's plan is already live the moment
      // this succeeds, so there's no reason to force the coach back to the
      // overview tab if they want to keep adjusting it.
      window.clearTimeout(savedTimer.current);
      setJustSaved(true);
      savedTimer.current = window.setTimeout(() => setJustSaved(false), 3000);
    },
  });

  // Goes through the same guard `useUnsavedGuard` registered above (so this
  // button and every other way to leave — tab rail, bottom nav — ask
  // identically), then prefers real back over always landing on the overview
  // tab, and only clears the draft once the exit is actually confirmed (never
  // leaves a stale/discarded draft behind, but never wipes one the user kept).
  const exit = useBack(`/coach/client/${clientId}`, () => void draftStore.removeItem(draftKey));

  if (!plan) {
    return (
      <>
        <TopBar testId="coach-workout-editor" title={t('coachEditor.workoutTitle')} dense onBack={exit} />
        <LoadingState variant="list" count={4} />
      </>
    );
  }

  const change = (days: WorkoutDay[], exercises: Record<string, Exercise>) => setPlan((p) => (p ? { ...p, days, exercises } : p));

  const header = (
    <div className="space-y-2">
      <ClientContextPanel clientId={clientId} />
      {save.isError && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{(save.error as Error)?.message || t('coachEditor.saveFailed')}</p>
      )}
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
        ) : justSaved ? (
          <p className="text-[12px] text-success" data-testid="workout-saved">{t('common.saved')}</p>
        ) : <span />}
        <button type="button" className="chip" data-testid="save-as-template" onClick={() => setAsTemplate(true)}>
          {t('coachEditor.saveAsTemplate')}
        </button>
      </div>
      <p className="text-[11.5px] text-earth-subtle">{t('coachEditor.saveHint')}</p>
      <VersionActions clientId={clientId} kind="workout" plan={plan} createdBy={coachId} />
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
          <SubmitButton type="button" data-testid="workout-save" pending={save.isPending} className="h-[42px] px-4 text-xs" onClick={() => save.mutate()}>
            {t('coachEditor.saveAssigned')}
          </SubmitButton>
        }
      />
      <PlanBuilder days={plan.days} exercises={plan.exercises} onChange={change} coachId={coachId} header={header} />
      <Sheet open={asTemplate} onClose={() => setAsTemplate(false)} size="md" title={t('coachEditor.saveAsTemplate')}>
        <SaveAsTemplateForm coachId={coachId} plan={plan} onDone={() => setAsTemplate(false)} />
      </Sheet>
    </>
  );
}

function SaveAsTemplateForm({ coachId, plan, onDone }: { coachId: string; plan: WorkoutPlan; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(plan.name);
  const [goal, setGoal] = useState<WorkoutGoal>('hypertrophy');
  const [split, setSplit] = useState<SplitType>('ppl');
  const [saveError, setSaveError] = useState(false);
  const mut = useMutation({
    mutationFn: () => saveClientPlanAsTemplate(coachId, plan, name.trim(), goal, split),
    onSuccess: () => {
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
