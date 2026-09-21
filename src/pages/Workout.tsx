import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout, warmupCountOf } from '@/stores/workoutStore';
import { useSubscription } from '@/hooks/useSubscription';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { TrainingGuideSheet } from '@/components/TrainingGuideSheet';
import { WaitingForCoach } from '@/components/WaitingForCoach';
import { muscleColor } from '@/lib/muscle';
import type { WorkoutDay } from '@/types';

export function Workout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [guideOpen, setGuideOpen] = useState(false);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const rawActive = useWorkout((s) => s.active);
  const startSession = useWorkout((s) => s.startSession);
  const previousFor = useWorkout((s) => s.previousFor);
  const { readOnly } = useSubscription();
  const active = rawActive && (rawActive.startedAt || rawActive.finished) ? rawActive : null;
  const finishedCount = useMemo(() => logs.filter((l) => l.finished).length, [logs]);
  // Same rotation math as Home's "up next" card — which day is suggested next.
  const upNextId = plan && plan.days.length ? plan.days[finishedCount % plan.days.length]?.id : null;
  const [openId, setOpenId] = useState<string | null>(null);
  // The accordion opens on the "up next" day the first time it renders.
  const effectiveOpenId = openId ?? upNextId;

  if (!plan) {
    return (
      <div className="anim-rise">
        <TopBar title={t('gt.routines')} eyebrow={t('workout.weeklyPlan')} />
        <WaitingForCoach messageKey="clientCoach.waitingWorkout" />
      </div>
    );
  }

  const activeDay = active ? plan.days.find((d) => d.id === active.dayId) : null;

  const goStart = async (day: WorkoutDay) => {
    if (readOnly) return;
    if (active && !active.finished && active.dayId === day.id) {
      navigate('/workout/session');
      return;
    }
    await startSession(day.id);
    navigate('/workout/session');
  };

  return (
    <div className="anim-rise">
      <TopBar
        title={t('gt.routines')}
        eyebrow={t('workout.weeklyPlan')}
        right={
          <button type="button" onClick={() => setGuideOpen(true)} className="icon-btn h-11 w-11" aria-label={t('guide.title')}>
            <Icon name="info" size={20} />
          </button>
        }
      />
      <TrainingGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />

      {active && active.dayId !== effectiveOpenId && (
        <button type="button" onClick={() => navigate('/workout/session')} className="btn-primary mb-4 w-full">
          <Icon name={active.finished ? 'edit' : 'play'} size={16} />
          {active.finished ? t('common.edit') : t('workout.resumeSession')} · {activeDay?.title ?? ''}
        </button>
      )}

      <ul className="space-y-3">
        {plan.days.map((day, i) => {
          const isUpNext = day.id === upNextId;
          const isOpen = day.id === effectiveOpenId;
          const isActiveDay = active?.dayId === day.id;
          const totalSets = day.exerciseIds.reduce((n, id) => {
            const ex = plan.exercises[id];
            return n + (ex ? (ex.workingSets > 0 ? ex.workingSets + warmupCountOf(ex) : Math.max(1, warmupCountOf(ex))) : 0);
          }, 0);
          return (
            <li key={day.id} className={`card overflow-hidden p-0 ${isOpen && isUpNext ? 'border-brand/35 bg-brand/[0.03]' : ''}`}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? '' : day.id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-start"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isUpNext ? 'bg-brand/15 text-brand' : 'bg-surface-raised text-earth-muted'}`}>
                  <Icon name="dumbbell" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow mb-0.5">
                    {isUpNext ? `${t('gt.upNext')} · ` : ''}
                    {t('coachEditor.day')} {i + 1} · {day.focus || day.title}
                  </p>
                  <h2 className="font-display text-base font-semibold tracking-[-0.01em]">{day.title}</h2>
                </div>
                <span className="pill pill-mute">{totalSets} {t('common.sets').toLowerCase()}</span>
                <Icon name={isOpen ? 'chevronDown' : 'chevron'} size={18} className="shrink-0 text-earth-subtle rtl:rotate-180" />
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 pb-4 pt-1">
                  {day.exerciseIds.length === 0 ? (
                    <p className="py-4 text-center text-sm text-earth-muted">{t('workout.dayEmpty')}</p>
                  ) : (
                    <ul className="divide-y divide-line-soft">
                      {day.exerciseIds.map((id) => {
                        const ex = plan.exercises[id];
                        if (!ex) return null;
                        const prev = previousFor(id);
                        const prevSet = prev?.sets.find((s) => s.weightKg != null || s.actualReps != null);
                        return (
                          <li key={id} className="flex items-center gap-3 py-2.5">
                            <span
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line"
                              style={{ background: `linear-gradient(150deg, ${muscleColor(ex.targetMuscle)}26, transparent)` }}
                            >
                              <Icon name="play" size={14} style={{ color: muscleColor(ex.targetMuscle) }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium tracking-[-0.01em]">{ex.name}</p>
                              <p className="truncate font-mono text-[11px] text-earth-muted">
                                {ex.workingSets > 0 ? `${ex.workingSets} × ${ex.repRange && ex.repRange !== '-' ? ex.repRange : '—'}` : t('workout.warmup')}
                                {prevSet && ` · ${t('gt.last')} ${prevSet.weightKg ?? '–'}${t('common.kg')} × ${prevSet.actualReps ?? '–'}`}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <button type="button" disabled={readOnly} onClick={() => void goStart(day)} className="btn-primary mt-3 w-full disabled:opacity-40">
                    <Icon name={isActiveDay && !active?.finished ? 'edit' : 'play'} size={15} />
                    {isActiveDay && !active?.finished ? t('workout.resumeSession') : t('gt.startThisWorkout')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
