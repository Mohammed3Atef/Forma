import { exerciseDisplayName } from '@/lib/catalogText';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useWorkout, warmupCountOf } from '@/stores/workoutStore';
import { useCoachContentSync } from '@/stores/coachContentStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCardioPlan } from '@/services/platform/clientCoachApi';
import { TrainingGuideSheet } from '@/components/TrainingGuideSheet';
import { WaitingForCoach } from '@/components/WaitingForCoach';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { formatDate, formatNumber } from '@/lib/format';
import { today, weekStartOf } from '@/lib/utils';
import { markPlanSeen } from '@/lib/planSeen';
import { muscleColor } from '@/lib/muscle';
import type { WorkoutDay, WorkoutPlan } from '@/types';

/*
 * TRAIN (B2.3, doc 16): "What's my plan, and how do I do it?"
 *   next session first (start / resume / done) with last time's numbers;
 *   every plan day opens its day screen (CL-13 — the old rows led nowhere);
 *   cardio and history live here; the plan-reading guide stays reachable.
 * The plan is the coach's: nothing on this screen edits it.
 */

function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function daySets(day: WorkoutDay, plan: WorkoutPlan): number {
  return day.exerciseIds.reduce((n, id) => {
    const ex = plan.exercises[id];
    return n + (ex ? (ex.workingSets > 0 ? ex.workingSets + warmupCountOf(ex) : Math.max(1, warmupCountOf(ex))) : 0);
  }, 0);
}

export function Workout() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const uid = useSession((s) => s.uid) ?? '';
  const [guideOpen, setGuideOpen] = useState(false);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const active = useWorkout((s) => s.active);
  const startSession = useWorkout((s) => s.startSession);
  const beginTimer = useWorkout((s) => s.beginTimer);
  const previousFor = useWorkout((s) => s.previousFor);
  const contentSync = useCoachContentSync();
  const { readOnly } = useSubscription();
  const cardioQ = useQuery({ queryKey: ['myCardioPlan', uid], queryFn: () => fetchMyCardioPlan(uid), enabled: !!uid });

  // Opening Train = the client has seen the current plan ("plan updated" clears, D11).
  useEffect(() => {
    if (plan) markPlanSeen(uid, 'workout', plan.updatedAt);
  }, [uid, plan]);

  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);
  const day = today();
  const running = active && active.startedAt && !active.finished ? active : logs.find((l) => l.startedAt && !l.finished) ?? null;
  const todayLog = logs.find((l) => l.date === day) ?? null;
  const nextDay = plan && plan.days.length ? plan.days[finished.length % plan.days.length] : null;
  const weekStart = weekStartOf(new Date()).getTime();
  const doneThisWeek = new Set(finished.filter((l) => weekStartOf(dayKeyToDate(l.date)).getTime() === weekStart).map((l) => l.dayId));

  if (!plan) {
    if (contentSync.status === 'failed') return <ErrorState message={t('clientCoach.loadFailed')} onRetry={contentSync.retry ?? undefined} testId="train-load-error" />;
    if (contentSync.status === 'idle') return <LoadingState variant="list" count={3} />;
    return <WaitingForCoach messageKey="clientCoach.waitingWorkout" />;
  }

  // Start = start the clock too (one tap, no second "Start" in the session — CL-18).
  const start = async (target: WorkoutDay) => {
    if (readOnly) return;
    if (running) return navigate('/workout/session');
    await startSession(target.id);
    beginTimer();
    navigate('/workout/session');
  };

  const heroDay = running ? plan.days.find((d) => d.id === running.dayId) ?? nextDay : todayLog?.finished ? null : nextDay;
  const lastSession = finished[0];
  const cardioSessions = cardioQ.data?.sessions ?? [];

  return (
    <div className="space-y-8" data-testid="client-workout">
      <header>
        <p className="text-[14px] text-earth-muted">{plan.name}</p>
      </header>

      {/* Next session first */}
      {todayLog?.finished && !running ? (
        <section className="rounded-[20px] border border-white/[0.08] bg-surface-card p-5" data-testid="train-done">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-success text-[#06210f]">
              <Icon name="check" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-success">{t('today.doneTitle')}</p>
              <h2 className="truncate text-[20px] font-bold">{plan.days.find((d) => d.id === todayLog.dayId)?.title ?? t('today.sessionLabel')}</h2>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/workout/session')}>
              {t('today.viewSession')}
            </Button>
          </div>
          {nextDay && <p className="mt-3 text-[14px] text-earth-muted">{t('today.nextUp', { title: nextDay.title })}</p>}
        </section>
      ) : heroDay ? (
        <section
          className="relative overflow-hidden rounded-[20px] border border-white/[0.1] bg-gradient-surface-hi p-5 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-[''] md:p-6"
          data-testid="train-hero"
        >
          <div className="relative z-[1]">
            <p className="text-[13px] font-medium text-brand-hover">
              {running ? t('today.inProgress') : t('train.upNext')} · {t('today.dayOf', { n: heroDay.dayIndex + 1, total: plan.days.length })}
            </p>
            <h2 className="mt-1 text-[30px] font-bold leading-[1.1] tracking-[-0.02em]">{heroDay.title}</h2>
            {heroDay.focus ? <p className="mt-1 text-[15px] text-earth-muted">{heroDay.focus}</p> : null}
            <ul className="mt-4 space-y-2">
              {heroDay.exerciseIds.map((id) => {
                const ex = plan.exercises[id];
                if (!ex) return null;
                const prevSets = previousFor(id)?.sets ?? [];
                const top = prevSets.find((s) => s.weightKg != null || s.actualReps != null);
                return (
                  <li key={id} className="flex items-center gap-3 text-[14px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{exerciseDisplayName(ex, lang)}</span>
                    <span className="shrink-0 font-mono text-[13px] text-earth-muted" dir="ltr">
                      {top ? `${top.weightKg ?? '–'} × ${top.actualReps ?? '–'}` : `${ex.workingSets} × ${ex.repRange}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {readOnly ? (
              <p className="mt-5 rounded-ui-control bg-white/[0.05] px-3 py-2.5 text-[14px] text-earth-muted" role="status">
                {t('today.readOnly')}
              </p>
            ) : (
              <Button size="lg" icon="play" className="mt-5 w-full" onClick={() => void start(heroDay)}>
                {running ? t('today.resume') : t('gt.startThisWorkout')}
              </Button>
            )}
            <button type="button" onClick={() => navigate(`/workout/routine/${heroDay.id}`)} className="hit-44 mx-auto mt-3 block text-[14px] font-medium text-earth-muted hover:text-earth">
              {t('train.viewDay')}
            </button>
          </div>
        </section>
      ) : null}

      {/* The whole plan: every day opens its day screen */}
      <Section title={t('train.yourPlan')} testId="train-days">
        <ListGroup>
          {plan.days.map((d) => {
            const exCount = d.exerciseIds.filter((id) => plan.exercises[id]).length;
            const done = doneThisWeek.has(d.id);
            return (
              <ListRow
                key={d.id}
                to={`/workout/routine/${d.id}`}
                testId={`train-day-${d.id}`}
                leading={
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-ui-control font-mono text-[15px] font-semibold ${done ? 'bg-success/15 text-success' : 'bg-white/[0.06] text-earth-muted'}`}>
                    {done ? <Icon name="check" size={18} /> : d.dayIndex + 1}
                  </span>
                }
                title={d.title}
                meta={d.focus || `${t('today.exercises', { count: exCount })} · ${t('today.sets', { count: daySets(d, plan) })}`}
                trailing={!running && nextDay?.id === d.id && !todayLog?.finished ? <span className="text-[12px] font-semibold text-brand-hover">{t('train.next')}</span> : null}
                chevron
              />
            );
          })}
        </ListGroup>
      </Section>

      {/* Cardio — the coach's plan + the live timer and log live in Train */}
      <Section title={t('nav.cardio')} testId="train-cardio">
        <ListGroup>
          {cardioSessions.map((s) => (
            <ListRow
              key={s.id}
              to="/cardio"
              leading={<IconTile icon="activity" tone="info" />}
              title={t(`cardio.types.${s.type}`, { defaultValue: s.type })}
              meta={[`${formatNumber(s.durationMin, lang)} ${t('common.min')}`, s.frequency].filter(Boolean).join(' · ')}
              chevron
            />
          ))}
          <ListRow to="/cardio" testId="train-cardio-log" leading={<IconTile icon="timer" tone="neutral" />} title={t('train.cardioLog')} meta={t('train.cardioLogMeta')} chevron />
        </ListGroup>
      </Section>

      <Section title={t('nav.history')} testId="train-history">
        <ListGroup>
          <ListRow
            to="/history"
            leading={<IconTile icon="calendar" tone="neutral" />}
            title={t('train.historyTitle')}
            meta={lastSession ? t('train.historyMeta', { count: finished.length, date: formatDate(lastSession.date, lang, 'weekdayDayMonth') }) : t('train.historyEmpty')}
            chevron
          />
          <ListRow onClick={() => setGuideOpen(true)} testId="train-guide" leading={<IconTile icon="info" tone="neutral" />} title={t('guide.title')} meta={t('train.guideMeta')} chevron />
        </ListGroup>
      </Section>

      <TrainingGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
