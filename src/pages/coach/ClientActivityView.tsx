import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { StatTile } from '@/components/StatTile';
import { fetchClientDay } from '@/services/platform/coachApi';
import { getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { computeConsumed } from '@/stores/nutritionStore';
import { logSetCount, logVolume } from '@/lib/calc';
import { today } from '@/lib/utils';

function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/**
 * Day-by-day read-only view of a client's logged activity (workout sets with
 * weight × reps, nutrition, cardio, water, weight, checklist). Shared by the
 * coach (View activity) and admin (client details) — read-only; no editing.
 */
export function ClientActivityView({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const todayKey = today();
  const [date, setDate] = useState(todayKey);

  const day = useQuery({ queryKey: ['clientDay', clientId, date], queryFn: () => fetchClientDay(clientId, date), enabled: !!clientId });
  const wPlan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const mPlan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });

  const d = day.data;
  const exerciseName = (id: string) => wPlan.data?.exercises[id]?.name ?? id;
  const consumed = computeConsumed(mPlan.data ?? null, d?.nutrition ?? null);
  const macroTarget = mPlan.data?.targets;

  const totalSteps = (d?.cardio ?? []).reduce((a, c) => a + (c.steps ?? 0), 0);
  const totalCardioMin = Math.round((d?.cardio ?? []).reduce((a, c) => a + c.durationSec, 0) / 60);
  const mealsEaten = d?.nutrition ? Object.values(d.nutrition.mealsEaten).filter(Boolean).length : 0;
  const subs = d?.nutrition?.substitutions ?? {};
  const overrides = d?.nutrition?.itemOverrides ?? {};
  const subEntries = Object.entries(subs);

  const label = (() => {
    const [y, m, dd] = date.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  return (
    <>
      {/* Day navigator */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface-card px-2 py-2">
        <button type="button" className="icon-btn h-10 w-10" aria-label={t('activity.prevDay')} onClick={() => setDate(shiftDay(date, -1))}>
          <Icon name="chevronLeft" size={20} className={i18n.dir() === 'rtl' ? 'rotate-180' : ''} />
        </button>
        <div className="text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand">{date === todayKey ? t('common.today') : label}</div>
          {date !== todayKey && <div className="text-[11px] text-earth-subtle">{label}</div>}
        </div>
        <button
          type="button"
          className="icon-btn h-10 w-10 disabled:opacity-30"
          aria-label={t('activity.nextDay')}
          disabled={date >= todayKey}
          onClick={() => setDate(shiftDay(date, 1))}
        >
          <Icon name="chevron" size={20} className={i18n.dir() === 'rtl' ? 'rotate-180' : ''} />
        </button>
      </div>

      {day.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-4">
          {/* Workout — per-set weight × reps */}
          <section>
            <h2 className="h2 mb-2">{t('nav.workout')}</h2>
            {d?.workout && (d.workout.finished || d.workout.startedAt) ? (
              <div className="card">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{wPlan.data?.days.find((dy) => dy.id === d.workout!.dayId)?.title ?? t('activity.session')}</span>
                  <span className={`font-mono text-[10.5px] uppercase ${d.workout.finished ? 'text-success' : 'text-warn'}`}>
                    {d.workout.finished ? t('activity.finished') : t('activity.inProgress')}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <Mini label={t('gt.setsDone')} value={logSetCount(d.workout)} />
                  <Mini label={t('gt.volume')} value={`${(logVolume(d.workout) / 1000).toFixed(1)}t`} />
                  <Mini label={t('gt.duration')} value={`${Math.round(d.workout.durationSec / 60)}m`} />
                </div>
                <div className="divide-y divide-line-soft">
                  {d.workout.exercises.map((ex) => {
                    const done = ex.sets.filter((s) => s.done).length;
                    return (
                      <div key={ex.exerciseId} className="py-2.5">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{exerciseName(ex.exerciseId)}</span>
                          <span className="font-mono text-[11px] text-earth-subtle">{done}/{ex.sets.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ex.sets.map((s, i) => (
                            <span key={i} className={`chip text-[11px] ${s.done ? 'chip-on' : ''}`}>
                              {s.type === 'warmup' && <span className="me-1 opacity-70">{t('coachEditor.warmupShort')}</span>}
                              {s.weightKg != null ? `${s.weightKg}${t('common.kg')}` : '—'} × {s.actualReps ?? (s.targetReps || '—')}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyCard text={t('activity.noWorkout')} />
            )}
          </section>

          {/* Nutrition */}
          <section>
            <h2 className="h2 mb-2">{t('nav.nutrition')}</h2>
            {d?.nutrition && mealsEaten > 0 ? (
              <div className="card">
                <p className="mb-3 text-sm text-earth-muted">{t('activity.mealsEaten', { n: mealsEaten })}</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <Mini label={t('nutrition.calories')} value={`${Math.round(consumed.calories)}${macroTarget ? `/${macroTarget.calories}` : ''}`} />
                  <Mini label={t('nutrition.protein')} value={`${Math.round(consumed.protein)}`} />
                  <Mini label={t('nutrition.carbs')} value={`${Math.round(consumed.carbs)}`} />
                  <Mini label={t('nutrition.fats')} value={`${Math.round(consumed.fats)}`} />
                </div>
                {subEntries.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-line-soft pt-3" data-testid="activity-substitutions">
                    <p className="label">{t('nutritionSub.substitutions')}</p>
                    {subEntries.map(([origId, tag]) => {
                      const repl = overrides[origId];
                      return (
                        <div key={origId} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="min-w-0 truncate">{repl ? repl.name.en : t('nutrition.removed')}</span>
                          <span className={`chip ${tag.source === 'approved_substitution' ? 'border-success/50 text-success' : 'border-warn/50 text-warn'}`}>
                            {tag.source === 'approved_substitution' ? t('nutritionSub.approvedSubstitution') : t('nutritionSub.customSubstitution')}
                            {tag.pendingApproval ? ` · ${t('nutritionSub.needsReview')}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <EmptyCard text={t('activity.noNutrition')} />
            )}
          </section>

          {/* Activity / body */}
          <section>
            <h2 className="h2 mb-2">{t('activity.activityBody')}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile icon="steps" value={totalSteps.toLocaleString()} label={t('cardio.steps')} />
              <StatTile icon="activity" value={totalCardioMin} unit={t('common.min')} label={t('cardio.minutes')} />
              <StatTile icon="water" value={d?.nutrition?.waterMl ?? 0} unit="ml" label={t('nutrition.water')} />
              <StatTile icon="scale" value={d?.weight?.weightKg ?? '—'} unit={d?.weight ? t('common.kg') : undefined} label={t('coach.lastWeight')} />
            </div>
          </section>

          {/* Checklist */}
          {d?.checklist && Object.keys(d.checklist.items).length > 0 && (
            <section>
              <h2 className="h2 mb-2">{t('home.dailyChecklist')}</h2>
              <div className="card flex items-center justify-between">
                <span className="text-sm text-earth-muted">{t('home.completion')}</span>
                <span className="font-mono text-lg text-brand">{d.checklist.completionPct}%</span>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-lg">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="card py-6 text-center text-sm text-earth-muted">{text}</div>;
}
