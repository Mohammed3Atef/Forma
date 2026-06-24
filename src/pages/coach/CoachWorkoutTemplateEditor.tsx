import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { TopBar } from '@/components/TopBar';
import { PlanBuilder } from '@/components/workout/PlanBuilder';
import { useSession } from '@/services/auth/sessionStore';
import { uid } from '@/lib/utils';
import { getWorkoutTemplate, saveWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { Exercise, SplitType, WorkoutDay, WorkoutGoal, WorkoutTemplate } from '@/types';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const GOALS: WorkoutGoal[] = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
const SPLITS: SplitType[] = ['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom'];

function blankTemplate(coachId: string): WorkoutTemplate {
  const now = 0; // stamped on save
  return { id: uid('wtpl'), coachId, name: '', goal: 'hypertrophy', splitType: 'ppl', days: [], exercises: {}, createdAt: now, updatedAt: now };
}

export function CoachWorkoutTemplateEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { templateId = 'new' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const isNew = templateId === 'new';
  const draftKey = `workoutTemplateDraft:${templateId}`;

  const query = useQuery({
    queryKey: ['workoutTemplate', coachId, templateId],
    queryFn: () => getWorkoutTemplate(coachId, templateId),
    enabled: !isNew && !!coachId,
  });
  const [tpl, setTpl] = useState<WorkoutTemplate | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (tpl !== null || (!isNew && query.isLoading)) return;
    void draftStore.getItem<WorkoutTemplate>(draftKey).then((draft) => {
      if (draft) {
        setTpl(draft);
        setDirty(true);
      } else {
        setTpl(isNew ? blankTemplate(coachId) : query.data ?? blankTemplate(coachId));
      }
    });
  }, [isNew, query.isLoading, query.data, tpl, draftKey, coachId]);

  useEffect(() => {
    if (tpl && dirty) void draftStore.setItem(draftKey, tpl);
  }, [tpl, dirty, draftKey]);

  const save = useMutation({
    mutationFn: () => saveWorkoutTemplate(tpl!),
    onSuccess: async () => {
      await draftStore.removeItem(draftKey);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
      navigate('/coach/templates');
    },
  });

  const exit = async () => {
    if (dirty && !(await confirmDialog({ title: t('coachEditor.unsavedTitle'), message: t('coachEditor.unsavedBody'), confirmLabel: t('coachEditor.leave'), danger: true }))) return;
    navigate('/coach/templates');
  };

  if (!tpl) return null;

  const patch = (p: Partial<WorkoutTemplate>) => {
    setTpl((cur) => (cur ? { ...cur, ...p } : cur));
    setDirty(true);
  };
  const change = (days: WorkoutDay[], exercises: Record<string, Exercise>) => patch({ days, exercises });

  const header = (
    <div className="space-y-3">
      {save.isError && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{(save.error as Error)?.message || t('coachEditor.saveFailed')}</p>}
      <input className="input" data-testid="template-name" value={tpl.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t('workoutTemplate.namePlaceholder')} />
      <div>
        <div className="label mb-1.5">{t('workoutTemplate.goal')}</div>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => (
            <button key={g} type="button" className={`chip ${tpl.goal === g ? 'chip-on' : ''}`} onClick={() => patch({ goal: g })}>
              {t(`workoutTemplate.goals.${g}`)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-1.5">{t('workoutTemplate.split')}</div>
        <div className="flex flex-wrap gap-2">
          {SPLITS.map((s) => (
            <button key={s} type="button" className={`chip ${tpl.splitType === s ? 'chip-on' : ''}`} onClick={() => patch({ splitType: s })}>
              {t(`workoutTemplate.splits.${s}`)}
            </button>
          ))}
        </div>
      </div>
      {dirty && <p className="text-[12px] text-warn">{t('coachEditor.unsavedIndicator')}</p>}
    </div>
  );

  return (
    <>
      <TopBar
        testId="coach-template-editor"
        title={t('workoutTemplate.editorTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => void exit()}
        right={
          <button type="button" data-testid="template-save" disabled={save.isPending || !tpl.name.trim()} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('common.save')}
          </button>
        }
      />
      <div data-testid="coach-desktop-plan-builder" className="lg:mx-auto lg:max-w-3xl">
        <PlanBuilder days={tpl.days} exercises={tpl.exercises} onChange={change} coachId={coachId} header={header} />
      </div>
    </>
  );
}
