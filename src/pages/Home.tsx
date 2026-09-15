import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition, computeConsumed } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useHabits } from '@/stores/habitStore';
import { useDay } from '@/stores/dayStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useActiveCheckIn } from '@/hooks/useActiveCheckIn';
import { useSession } from '@/services/auth/sessionStore';
import { Avatar } from '@/components/Avatar';
import { CoachInfoCard } from '@/components/CoachInfoCard';
import { Icon } from '@/components/Icon';
import { ProgressRing } from '@/components/ProgressRing';
import { StatTile } from '@/components/StatTile';
import { BarChart } from '@/components/charts';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { CoachCard } from '@/components/CoachCard';
import { WaitingForCoach } from '@/components/WaitingForCoach';
import { WeekStrip } from '@/components/WeekStrip';
import { TaskRow } from '@/components/TaskRow';
import { logVolume, logSetCount } from '@/lib/calc';
import { formatDuration, weekStartOf } from '@/lib/utils';
import type { WorkoutDay, WorkoutPlan } from '@/types';

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const profile = useSettings((s) => s.profile);
  const settings = useSettings((s) => s.settings);
  const targets = settings?.targets;
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const active = useWorkout((s) => s.active);
  const startSession = useWorkout((s) => s.startSession);
  const setDay = useDay((s) => s.setDay);
  const { readOnly } = useSubscription();
  const { checkIn } = useActiveCheckIn();
  const photoUrl = useSession((s) => s.account?.photoUrl);

  const mealPlan = useNutrition((s) => s.plan);
  const nutritionLog = useNutrition((s) => s.log);
  const consumed = useMemo(() => computeConsumed(mealPlan, nutritionLog), [mealPlan, nutritionLog]);
  const stepsFor = useCardio((s) => s.stepsFor);
  const selectedDay = useDay((s) => s.selected);
  const todaySteps = stepsFor(selectedDay);
  const checklist = useHabits((s) => s.checklist);
  const streaks = useHabits((s) => s.streaks);

  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);

  const suggestedDay = useMemo(() => {
    if (!plan) return null;
    return plan.days[finished.length % plan.days.length] ?? null;
  }, [plan, finished.length]);

  const dayMeta = (day: WorkoutDay, p: WorkoutPlan) => {
    let sets = 0;
    day.exerciseIds.forEach((id) => {
      const ex = p.exercises[id];
      if (ex) sets += ex.workingSets > 0 ? ex.workingSets + 1 : 1;
    });
    const restAvg = settings?.restDefaultSec ?? 90;
    return { ex: day.exerciseIds.length, sets, timeMin: Math.round((sets * (restAvg + 45)) / 60) };
  };

  // This-week aggregates + 8-week volume trend.
  const { week, trend, goal } = useMemo(() => {
    const curMon = weekStartOf(new Date()).getTime();
    const inWeek = finished.filter((l) => weekStartOf(parseDay(l.date)).getTime() === curMon);
    const buckets = Array.from({ length: 8 }, () => 0);
    finished.forEach((l) => {
      const wkMon = weekStartOf(parseDay(l.date)).getTime();
      const diffWeeks = Math.round((curMon - wkMon) / (7 * 86_400_000));
      const idx = 7 - diffWeeks;
      if (idx >= 0 && idx < 8) buckets[idx] += logVolume(l);
    });
    return {
      week: {
        workouts: inWeek.length,
        sets: inWeek.reduce((n, l) => n + logSetCount(l), 0),
        volume: inWeek.reduce((v, l) => v + logVolume(l), 0),
        timeMin: Math.round(inWeek.reduce((s, l) => s + l.durationSec, 0) / 60),
      },
      trend: buckets.map((v, i) => ({
        label: i === 7 ? t('gt.now') : `-${7 - i}w`,
        value: v,
      })),
      goal: settings?.weeklyWorkoutGoal ?? 5,
    };
  }, [finished, settings?.weeklyWorkoutGoal, t]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('gt.greetingMorning');
    if (h < 18) return t('gt.greetingAfternoon');
    return t('gt.greetingEvening');
  }, [t]);

  const recent = finished.slice(0, 3);
  const remaining = Math.max(0, goal - week.workouts);

  // Week-strip: which calendar days this week already have a finished session.
  const doneDates = useMemo(() => new Set(finished.map((l) => l.date)), [finished]);
  // Position within the plan's day-rotation (real, not a fabricated "week n of m").
  const rotationLabel = plan ? t('home.dayOfRotation', { n: (finished.length % plan.days.length) + 1, total: plan.days.length }) : null;

  // Today's 3-pillar task list (nutrition / workout / cardio) — the exact set the
  // real per-day checklist already derives (see habitLogic.buildChecklist), just
  // read back out here so the hero ring and the task rows always agree.
  const mealsDone = useMemo(() => {
    if (!mealPlan || !checklist) return null;
    const keys = mealPlan.meals.map((m) => `meal:${m.id}`);
    return keys.length > 0 && keys.every((k) => checklist.items[k]?.done);
  }, [mealPlan, checklist]);
  const workoutDone = checklist?.items.workout?.done ?? false;
  const hasCardioTarget = !!checklist && 'cardio' in checklist.items;
  const cardioDone = checklist?.items.cardio?.done ?? false;
  const coreTasks = [mealsDone !== null, plan != null, hasCardioTarget].filter(Boolean).length;
  const coreTasksDone = [mealsDone === true, workoutDone, hasCardioTarget && cardioDone].filter(Boolean).length;
  const todayPct = coreTasks ? coreTasksDone / coreTasks : 0;

  const startSuggested = async () => {
    if (readOnly) return; // subscription paused/ended → workouts are view-only
    if (active && !active.finished) {
      navigate('/workout/session');
      return;
    }
    if (suggestedDay) {
      await startSession(suggestedDay.id);
      navigate('/workout/session');
    }
  };

  const openSession = (date: string) => {
    setDay(date);
    navigate('/workout/session');
  };

  const dateEyebrow = new Date().toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="anim-rise space-y-4 pt-2" data-testid="client-home">
      {/* Greeting */}
      <header className="flex items-start justify-between pt-2">
        <div className="min-w-0">
          <p className="eyebrow mb-2">{dateEyebrow}</p>
          <h1 className="h1">
            {greeting}
            {profile?.name?.trim() ? (
              <>
                <br />
                <span className="text-earth-muted">{profile.name}.</span>
              </>
            ) : null}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Avatar name={profile?.name} photoUrl={photoUrl} size="sm" rounded="rounded-full" onClick={() => navigate('/settings')} />
          <SyncStatusBadge />
        </div>
      </header>

      {/* Week at a glance — tapping a day jumps into it (or opens its finished session) */}
      <WeekStrip doneDates={doneDates} onSelect={(key, done) => (done ? openSession(key) : setDay(key))} />

      {/* Weekly check-in requested by the coach — an action-required item, not a generic teaser */}
      {checkIn?.status === 'requested' && (
        <button
          type="button"
          data-testid="home-checkin"
          onClick={() => navigate(`/check-in/${checkIn.id}`)}
          className="card-tap flex w-full items-center gap-4 border border-warn/40 bg-warn/[0.06] text-start"
        >
          <span className="row-av bg-warn/15 text-warn">
            <Icon name="calendar" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow mb-1 block text-warn">{t('checkin.requiredTitle')}</span>
            <span className="block text-sm text-earth-muted">{t('checkin.requiredBody')}</span>
          </span>
          <Icon name="chevron" size={18} className="rtl:rotate-180" />
        </button>
      )}

      {/* No plan yet — make it clear the client is waiting on their coach. */}
      {!plan && <WaitingForCoach />}

      {/* FEATURED: today's single most important action */}
      {plan && (
        <div className="card-featured">
          <p className="eyebrow mb-3">
            {dateEyebrow}
            {rotationLabel ? ` · ${rotationLabel}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-5">
            <ProgressRing
              value={todayPct}
              size={104}
              stroke={8}
              label={`${Math.round(todayPct * 100)}%`}
              sublabel={coreTasks - coreTasksDone > 0 ? t('home.tasksLeft', { n: coreTasks - coreTasksDone }) : t('common.done')}
            />
            <div className="min-w-[180px] flex-1">
              <h2 className="h1">
                {active && !active.finished ? t('workout.resumeSession') : suggestedDay ? suggestedDay.title : t('home.restDay')}
              </h2>
              {suggestedDay && <p className="mt-1 text-sm text-earth-muted">{suggestedDay.focus}</p>}
              {suggestedDay &&
                (() => {
                  const m = dayMeta(suggestedDay, plan);
                  return (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 font-mono text-[11.5px] text-earth-muted">
                      <span className="flex items-center gap-1.5">
                        <Icon name="list" size={14} /> {m.ex}&nbsp;{t('gt.exercises').toLowerCase()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="bolt" size={14} /> {m.sets}&nbsp;{t('common.sets')}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Icon name="timer" size={14} /> ~{m.timeMin}&nbsp;{t('common.min')}
                      </span>
                    </div>
                  );
                })()}
              {suggestedDay && (
                <button type="button" disabled={readOnly} onClick={() => void startSuggested()} className="btn-primary mt-4 w-full disabled:opacity-40">
                  <Icon name="play" size={15} /> {active && !active.finished ? t('workout.resumeSession') : t('gt.startWorkout')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today's plan — the same 3 pillars behind the ring above, as tappable rows */}
      {plan && checklist && coreTasks > 0 && (
        <div className="card p-0">
          <div className="flex items-center justify-between px-5 pt-4">
            <p className="ui-label">{t('home.todaysPlan')}</p>
            <span className="pill pill-brand">{t('home.tasksLeft', { n: coreTasks - coreTasksDone })}</span>
          </div>
          <div className="px-5 pb-1">
            {mealsDone !== null && (
              <TaskRow
                icon="meal"
                tone="ok"
                title={t('nav.nutrition')}
                subtitle={`${Math.round(consumed.calories)} / ${targets?.calories ?? 0} kcal`}
                done={mealsDone}
                onClick={() => navigate('/nutrition')}
              />
            )}
            <TaskRow
              icon="dumbbell"
              tone="brand"
              title={suggestedDay ? suggestedDay.title : t('nav.workout')}
              subtitle={workoutDone ? t('workout.resumeSession') : active && !active.finished ? t('workout.resumeSession') : t('gt.startWorkout')}
              done={workoutDone}
              onClick={() => void startSuggested()}
            />
            {hasCardioTarget && (
              <TaskRow
                icon="activity"
                tone="info"
                title={t('nav.cardio')}
                subtitle={`${todaySteps.toLocaleString()} ${t('home.steps').toLowerCase()}`}
                done={cardioDone}
                onClick={() => navigate('/cardio')}
              />
            )}
          </div>
        </div>
      )}

      {/* From your coach */}
      <CoachInfoCard compact />
      <CoachCard />

      {/* Weekly goal — tap through to the history/calendar of completed workouts */}
      <button
        type="button"
        onClick={() => navigate('/history')}
        className="card-tap flex w-full items-center gap-4 text-start"
      >
        <ProgressRing
          value={goal ? week.workouts / goal : 0}
          size={64}
          stroke={6}
          label={`${week.workouts}/${goal}`}
        />
        <div className="flex-1">
          <h2 className="h2">{t('gt.weeklyGoal')}</h2>
          <p className="mt-0.5 text-[13px] text-earth-muted">
            {remaining > 0 ? t('gt.toGo', { n: remaining }) : t('gt.goalReached')}
          </p>
        </div>
        {(() => {
          const wk = streaks.workout;
          const streakActive = wk.current > 0;
          // Active workout streak → flame + current. Otherwise show the best
          // streak on record (trophy) so the number still reflects an achievement.
          return (
            <div
              className="flex items-center gap-1.5"
              title={streakActive ? t('gt.currentStreak') : t('gt.bestStreak')}
            >
              <Icon name={streakActive ? 'flame' : 'trophy'} size={18} className={streakActive ? 'text-brand' : 'text-earth-subtle'} />
              <span className={`font-mono text-lg font-medium ${streakActive ? '' : 'text-earth-muted'}`}>
                {streakActive ? wk.current : wk.longest}
              </span>
            </div>
          );
        })()}
        <Icon name="chevron" size={18} className="text-earth-subtle rtl:rotate-180" />
      </button>

      {/* This week */}
      <div className="sec-head">
        <h2 className="h2">{t('gt.thisWeek')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="dumbbell" value={week.workouts} label={t('gt.workouts')} />
        <StatTile icon="bolt" value={week.sets} label={t('gt.setsLogged')} />
        <StatTile icon="arrowUp" value={(week.volume / 1000).toFixed(1)} unit="t" label={t('gt.volume')} />
        <StatTile icon="timer" value={week.timeMin} unit="m" label={t('gt.time')} />
      </div>

      {/* Volume trend */}
      {finished.length > 0 && (
        <div className="card mt-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="ui-label">{t('gt.volumeTrend')}</span>
            <span className="font-mono text-[11px] text-brand">{t('gt.last8weeks')}</span>
          </div>
          <BarChart data={trend} format={(v) => `${Math.round(v / 1000)}t`} />
        </div>
      )}

      {/* Recent */}
      {recent.length > 0 && (
        <>
          <div className="sec-head">
            <h2 className="h2">{t('gt.recent')}</h2>
            <button type="button" className="sec-link" onClick={() => navigate('/history')}>
              {t('gt.viewAll')}
            </button>
          </div>
          <div className="card divide-y divide-line-soft p-0">
            {recent.map((l) => {
              const day = plan?.days.find((d) => d.id === l.dayId);
              return (
                <button key={l.id} type="button" onClick={() => openSession(l.date)} className="rowline w-full text-start">
                  <span className="tk-ic">
                    <Icon name="dumbbell" size={15} />
                  </span>
                  <div className="grow min-w-0">
                    <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{day?.title ?? t('workout.session')}</p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-earth-muted">
                      {parseDay(l.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {formatDuration(l.durationSec)} · {(logVolume(l) / 1000).toFixed(1)}t
                    </p>
                  </div>
                  <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle rtl:rotate-180" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Start empty */}
      <button type="button" onClick={() => navigate('/workout')} className="btn-ghost mt-4 w-full">
        <Icon name="plus" size={15} /> {t('gt.startEmpty')}
      </button>
    </div>
  );
}
