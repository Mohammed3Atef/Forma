import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { uid } from '@/lib/utils';
import { warmupCountOf } from '@/stores/workoutStore';
import { getClientWorkoutPlan, saveClientWorkoutPlan } from '@/services/platform/planApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { Exercise, WorkoutDay, WorkoutPlan } from '@/types';

function emptyPlan(): WorkoutPlan {
  return { id: uid('wplan'), name: '', days: [], exercises: {}, updatedAt: Date.now() };
}

interface ExForm {
  id: string | null;
  name: string;
  targetMuscle: string;
  warmupSets: string;
  workingSets: string;
  repRange: string;
  restSec: string;
  videoUrl: string;
  notes: string;
}

const blankEx = (): ExForm => ({ id: null, name: '', targetMuscle: '', warmupSets: '1', workingSets: '3', repRange: '8-12', restSec: '90', videoUrl: '', notes: '' });

export function CoachWorkoutEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { clientId = '' } = useParams();

  const query = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [editing, setEditing] = useState<{ dayId: string; form: ExForm } | null>(null);

  useEffect(() => {
    if (plan === null) setPlan(query.data ?? emptyPlan());
  }, [query.data, plan]);

  const save = useMutation({
    mutationFn: () => saveClientWorkoutPlan(clientId, plan!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clientWorkoutPlan', clientId] });
      navigate(`/coach/client/${clientId}`);
    },
  });

  if (!plan) return null;

  const addDay = () =>
    setPlan({
      ...plan,
      days: [...plan.days, { id: uid('day'), dayIndex: plan.days.length, title: `${t('coachEditor.day')} ${plan.days.length + 1}`, focus: '', exerciseIds: [] }],
    });

  const patchDay = (dayId: string, patch: Partial<WorkoutDay>) =>
    setPlan({ ...plan, days: plan.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)) });

  const removeDay = async (day: WorkoutDay) => {
    if (!(await confirmDialog({ title: t('coachEditor.removeDay'), message: day.title, danger: true }))) return;
    const exercises = { ...plan.exercises };
    day.exerciseIds.forEach((id) => delete exercises[id]);
    setPlan({ ...plan, exercises, days: plan.days.filter((d) => d.id !== day.id) });
  };

  const saveExercise = () => {
    if (!editing) return;
    const { dayId, form } = editing;
    const id = form.id ?? uid('ex');
    const warmupSetCount = Math.max(0, Number(form.warmupSets) || 0);
    const ex: Exercise = {
      id,
      name: form.name.trim(),
      targetMuscle: form.targetMuscle.trim(),
      warmupSets: String(warmupSetCount),
      warmupSetCount,
      workingSets: Math.max(0, Number(form.workingSets) || 0),
      repRange: form.repRange.trim(),
      rir: '',
      tempo: '',
      notes: { en: form.notes.trim(), ar: form.notes.trim() },
      restSec: Math.max(0, Number(form.restSec) || 0),
      videoId: null,
      videoUrl: form.videoUrl.trim() || null,
    };
    const exercises = { ...plan.exercises, [id]: ex };
    const days = plan.days.map((d) =>
      d.id === dayId && !d.exerciseIds.includes(id) ? { ...d, exerciseIds: [...d.exerciseIds, id] } : d,
    );
    setPlan({ ...plan, exercises, days });
    setEditing(null);
  };

  const removeExercise = (dayId: string, exId: string) => {
    const exercises = { ...plan.exercises };
    delete exercises[exId];
    setPlan({
      ...plan,
      exercises,
      days: plan.days.map((d) => (d.id === dayId ? { ...d, exerciseIds: d.exerciseIds.filter((x) => x !== exId) } : d)),
    });
  };

  return (
    <>
      <TopBar
        title={t('coachEditor.workoutTitle')}
        eyebrow={t('platform.coachPortal')}
        onBack={() => navigate(`/coach/client/${clientId}`)}
        right={
          <button type="button" disabled={save.isPending} className="btn-primary h-[42px] px-4 text-xs disabled:opacity-40" onClick={() => save.mutate()}>
            {t('common.save')}
          </button>
        }
      />

      {save.isError && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {(save.error as Error)?.message || t('coachEditor.saveFailed')}
        </p>
      )}

      <label className="label" htmlFor="wp-name">{t('coachEditor.planName')}</label>
      <input id="wp-name" className="input mb-5" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} placeholder={t('coachEditor.planNamePlaceholder')} />

      <div className="space-y-4">
        {plan.days.map((day) => (
          <div key={day.id} className="card">
            <div className="mb-3 flex items-center gap-2">
              <input className="input flex-1" value={day.title} onChange={(e) => patchDay(day.id, { title: e.target.value })} placeholder={t('coachEditor.dayTitle')} />
              <button type="button" className="text-danger" aria-label={t('coachEditor.removeDay')} onClick={() => void removeDay(day)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <input className="input mb-3" value={day.focus} onChange={(e) => patchDay(day.id, { focus: e.target.value })} placeholder={t('coachEditor.dayFocus')} />

            <div className="divide-y divide-line-soft">
              {day.exerciseIds.map((exId) => {
                const ex = plan.exercises[exId];
                if (!ex) return null;
                return (
                  <div key={exId} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-start"
                      onClick={() =>
                        setEditing({
                          dayId: day.id,
                          form: { id: ex.id, name: ex.name, targetMuscle: ex.targetMuscle, warmupSets: String(warmupCountOf(ex)), workingSets: String(ex.workingSets), repRange: ex.repRange, restSec: String(ex.restSec), videoUrl: ex.videoUrl ?? '', notes: ex.notes.en },
                        })
                      }
                    >
                      <span className="block truncate font-medium">{ex.name || t('coachEditor.untitledExercise')}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">
                        {warmupCountOf(ex) > 0 && `${warmupCountOf(ex)} ${t('coachEditor.warmupShort')} + `}
                        {ex.workingSets} × {ex.repRange} · {ex.restSec}s{ex.videoUrl ? ' · 🎬' : ''}
                      </span>
                    </button>
                    <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => removeExercise(day.id, exId)}>
                      <Icon name="minus" size={18} />
                    </button>
                  </div>
                );
              })}
            </div>

            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => setEditing({ dayId: day.id, form: blankEx() })}>
              {t('coachEditor.addExercise')}
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn-ghost mt-4 w-full" onClick={addDay}>
        {t('coachEditor.addDay')}
      </button>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={t('coachEditor.exercise')}>
        {editing && (
          <div className="space-y-3">
            <input className="input" placeholder={t('coachEditor.exerciseName')} value={editing.form.name} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, name: e.target.value } })} />
            <input className="input" placeholder={t('coachEditor.targetMuscle')} value={editing.form.targetMuscle} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, targetMuscle: e.target.value } })} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">{t('coachEditor.warmupSets')}</label>
                <input className="input" inputMode="numeric" value={editing.form.warmupSets} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, warmupSets: e.target.value } })} />
              </div>
              <div>
                <label className="label">{t('coachEditor.workingSets')}</label>
                <input className="input" inputMode="numeric" value={editing.form.workingSets} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, workingSets: e.target.value } })} />
              </div>
              <div>
                <label className="label">{t('coachEditor.reps')}</label>
                <input className="input" value={editing.form.repRange} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, repRange: e.target.value } })} />
              </div>
              <div>
                <label className="label">{t('coachEditor.restSec')}</label>
                <input className="input" inputMode="numeric" value={editing.form.restSec} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, restSec: e.target.value } })} />
              </div>
            </div>
            <p className="text-[12px] text-earth-subtle">{t('coachEditor.setsHint')}</p>
            <input className="input" placeholder={t('coachEditor.videoUrl')} value={editing.form.videoUrl} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, videoUrl: e.target.value } })} />
            <textarea className="input min-h-24" placeholder={t('coachEditor.instructions')} value={editing.form.notes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, notes: e.target.value } })} />
            <button type="button" disabled={!editing.form.name.trim()} onClick={saveExercise} className="btn-primary w-full disabled:opacity-40">
              {t('common.save')}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
