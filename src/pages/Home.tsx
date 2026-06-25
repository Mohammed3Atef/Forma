import { useMemo, useState } from 'react';
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

  const [hover, setHover] = useState(false);

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

      {/* Weekly check-in requested by the coach — prominent call to action */}
      {checkIn?.status === 'requested' && (
        <button
          type="button"
          data-testid="home-checkin"
          onClick={() => navigate(`/check-in/${checkIn.id}`)}
          className="card-tap flex w-full items-center gap-4 border border-brand/40 text-start"
        >
          <span className="row-av bg-brand/15 text-brand">
            <Icon name="calendar" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow mb-1 block text-brand">{t('checkin.requiredTitle')}</span>
            <span className="block text-sm text-earth-muted">{t('checkin.requiredBody')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      {/* Your coach (compact) */}
      <CoachInfoCard compact />

      {/* Coach announcements / assigned plans (only when the client has a coach) */}
      <CoachCard />

      {/* No plan yet — make it clear the client is waiting on their coach. */}
      {!plan && <WaitingForCoach />}

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
          const active = wk.current > 0;
          // Active workout streak → flame + current. Otherwise show the best
          // streak on record (trophy) so the number still reflects an achievement.
          return (
            <div
              className="flex items-center gap-1.5"
              title={active ? t('gt.currentStreak') : t('gt.bestStreak')}
            >
              <Icon name={active ? 'flame' : 'trophy'} size={18} className={active ? 'text-brand' : 'text-earth-subtle'} />
              <span className={`font-mono text-lg font-medium ${active ? '' : 'text-earth-muted'}`}>
                {active ? wk.current : wk.longest}
              </span>
            </div>
          );
        })()}
        <Icon name="chevron" size={18} className="text-earth-subtle" />
      </button>

      {/* Up next hero */}
      {suggestedDay && plan && (
        <button
          type="button"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={() => void startSuggested()}
          disabled={readOnly}
          className={`relative w-full overflow-hidden rounded-hero border border-brand/25 p-6 text-start transition-transform active:scale-[0.99] ${readOnly ? 'opacity-50' : ''}`}
          style={{
            background:
              'radial-gradient(120% 120% at 85% 0%, rgba(229,82,15,0.22), transparent 50%), linear-gradient(150deg,#2a1d14,#1a140d,#120d08)',
          }}
        >
          <p className="eyebrow mb-3">
            {t('gt.upNext')} · {t('gt.recommended')}
          </p>
          <h2 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em]">
            {active && !active.finished ? t('workout.resumeSession') : suggestedDay.title}
          </h2>
          <p className="mt-1 text-sm text-earth-muted">{suggestedDay.focus}</p>
          {(() => {
            const m = dayMeta(suggestedDay, plan);
            return (
              <div className="mt-4 flex items-center gap-5 font-mono text-[11.5px] text-earth-muted">
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
          <span className="btn-light mt-5 w-full" style={{ transform: hover ? 'translateY(-1px)' : undefined }}>
            <Icon name="play" size={15} /> {t('gt.startWorkout')}
          </span>
        </button>
      )}

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

      {/* Today's daily checklist — only meaningful once a plan/targets exist. */}
      {plan && checklist && Object.keys(checklist.items).length > 0 && (
        <button type="button" onClick={() => navigate('/nutrition')} className="card-tap mt-3 flex w-full items-center gap-4 text-start">
          <ProgressRing value={checklist.completionPct / 100} size={56} stroke={6} label={`${checklist.completionPct}%`} />
          <div className="flex-1">
            <h2 className="h2">{t('home.dailyChecklist')}</h2>
            <p className="mt-0.5 font-mono text-[11.5px] text-earth-muted">
              {Math.round(consumed.calories)} / {targets?.calories ?? 0} kcal · {todaySteps.toLocaleString()} {t('home.steps').toLowerCase()}
            </p>
          </div>
          <Icon name="chevron" size={18} className="text-earth-subtle" />
        </button>
      )}

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
          <div>
            {recent.map((l) => {
              const day = plan?.days.find((d) => d.id === l.dayId);
              return (
                <button key={l.id} type="button" onClick={() => openSession(l.date)} className="row w-full text-start">
                  <span className="row-av">
                    <Icon name="dumbbell" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{day?.title ?? t('workout.session')}</p>
                    <p className="mt-0.5 font-mono text-[11.5px] text-earth-muted">
                      {parseDay(l.date).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' })}
                      {' · '}
                      {formatDuration(l.durationSec)} · {(logVolume(l) / 1000).toFixed(1)}t
                    </p>
                  </div>
                  <Icon name="chevron" size={18} className="text-earth-subtle" />
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
