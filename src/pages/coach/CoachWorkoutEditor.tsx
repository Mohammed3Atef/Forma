import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { PlanBuilder } from '@/components/workout/PlanBuilder';
import { VersionActions } from '@/components/coach/VersionActions';
import { useSession } from '@/services/auth/sessionStore';
import { uid } from '@/lib/utils';
import { getClientWorkoutPlan, saveClientWorkoutPlan } from '@/services/platform/planApi';
import { saveClientPlanAsTemplate } from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { Exercise, SplitType, WorkoutDay, WorkoutGoal, WorkoutPlan } from '@/types';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function emptyPlan(): WorkoutPlan {
  return { id: uid('wplan'), name: '', days: [], exercises: {}, updatedAt: Date.now() };
}

export function CoachWorkoutEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (plan !== null || query.isLoading) return;
    void draftStore.getItem<WorkoutPlan>(draftKey).then((draft) => {
      const base = query.data ?? emptyPlan();
      baselineRef.current = JSON.stringify(base);
      setPlan(draft ?? base);
    });
  }, [query.isLoading, query.data, plan, draftKey]);

  const dirty = plan !== null && JSON.stringify(plan) !== baselineRef.current;

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
      navigate(`/coach/client/${clientId}`);
    },
  });

  const exit = async () => {
    if (dirty && !(await confirmDialog({ title: t('coachEditor.unsavedTitle'), message: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave'), danger: true }))) return;
    await draftStore.removeItem(draftKey); // never leave a stale/discarded draft behind
    navigate(`/coach/client/${clientId}`);
  };

  if (!plan) return null;

  const change = (days: WorkoutDay[], exercises: Record<string, Exercise>) => setPlan((p) => (p ? { ...p, days, exercises } : p));

  const header = (
    <div className="space-y-2">
      {save.isError && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{(save.error as Error)?.message || t('coachEditor.saveFailed')}</p>
      )}
      {plan.meta?.sourceTemplateName && (
        <p className="text-[12px] text-earth-subtle">
          {t('coachEditor.fromTemplate', { name: plan.meta.sourceTemplateName })}
          {plan.meta.isCustomized ? ` · ${t('coachEditor.customized')}` : ''}
        </p>
      )}
      <input
        className="input"
        data-testid="workout-plan-name"
        value={plan.name}
        onChange={(e) => setPlan({ ...plan, name: e.target.value })}
        placeholder={t('coachEditor.planNamePlaceholder')}
      />
      <div className="flex items-center justify-between">
        {dirty ? <p className="text-[12px] text-warn" data-testid="workout-unsaved">{t('coachEditor.unsavedIndicator')}</p> : <span />}
        <button type="button" className="chip" data-testid="save-as-template" onClick={() => setAsTemplate(true)}>
          {t('coachEditor.saveAsTemplate')}
        </button>
      </div>
      <VersionActions clientId={clientId} kind="workout" plan={plan} createdBy={coachId} />
    </div>
  );

  return (
    <>
      <TopBar
        testId="coach-workout-editor"
        title={t('coachEditor.workoutTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => void exit()}
        right={
          <button type="button" data-testid="workout-save" disabled={save.isPending} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('coachEditor.saveAssigned')}
          </button>
        }
      />
      <PlanBuilder days={plan.days} exercises={plan.exercises} onChange={change} coachId={coachId} header={header} />
      <Sheet open={asTemplate} onClose={() => setAsTemplate(false)} title={t('coachEditor.saveAsTemplate')}>
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
  const mut = useMutation({
    mutationFn: () => saveClientPlanAsTemplate(coachId, plan, name.trim(), goal, split),
    onSuccess: onDone,
  });
  return (
    <div className="space-y-3">
      <input className="input" data-testid="template-from-plan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('workoutTemplate.namePlaceholder')} />
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
      <button type="button" disabled={!name.trim() || mut.isPending} onClick={() => mut.mutate()} className="btn-primary w-full disabled:opacity-40">
        {t('common.save')}
      </button>
    </div>
  );
}
