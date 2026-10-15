import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settingsStore';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition, computeConsumed } from '@/stores/nutritionStore';
import { useCardio } from '@/stores/cardioStore';
import { useDay } from '@/stores/dayStore';
import { useCoachContentSync } from '@/stores/coachContentStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useActiveCheckIn } from '@/hooks/useActiveCheckIn';
import { useClientMessageUnread } from '@/hooks/useClientMessageUnread';
import { useNotifications } from '@/hooks/useNotifications';
import { useMyCoach } from '@/hooks/useMyCoach';
import { useSession } from '@/services/auth/sessionStore';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Button, IconButton } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { formatDate, formatNumber } from '@/lib/format';
import { today, weekStartOf } from '@/lib/utils';
import { isPlanUpdated } from '@/lib/planSeen';
import type { WorkoutDay, WorkoutLog, WorkoutPlan } from '@/types';

/*
 * TODAY (B2.2 — doc 16 "the home screen is an action queue, not a report").
 * Answers one question: what is the most important thing to do next?
 *   1. a compact greeting;
 *   2. ONE adaptive hero (start · resume · done · week complete · waiting ·
 *      no coach · read-only · loading · load error) — never "Start" after the
 *      session is done (CL-10), never an invented workout;
 *   3. at most one coach item, only when actionable;
 *   4. today's essentials, only the ones that exist;
 *   5. progress from real data only (no zero tiles, no invented streaks).
 * Today is always today: arriving here resets the logging day (P5 / CL-04).
 */

function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function setsOf(log: WorkoutLog) {
  let done = 0;
  let total = 0;
  for (const e of log.exercises) for (const s of e.sets) {
    total += 1;
    if (s.done) done += 1;
  }
  return { done, total };
}

function plannedSets(day: WorkoutDay, plan: WorkoutPlan): number {
  return day.exerciseIds.reduce((n, id) => {
    const ex = plan.exercises[id];
    return ex ? n + Math.max(1, ex.workingSets) + (ex.warmupSetCount ?? 0) : n;
  }, 0);
}

type HeroState = 'loading' | 'error' | 'no_coach' | 'waiting' | 'in_progress' | 'done' | 'week_done' | 'planned';

export function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const uid = useSession((s) => s.uid) ?? '';
  const account = useSession((s) => s.account);
  const profile = useSettings((s) => s.profile);
  const targets = useSettings((s) => s.settings?.targets);
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const active = useWorkout((s) => s.active);
  const startSession = useWorkout((s) => s.startSession);
  const mealPlan = useNutrition((s) => s.plan);
  const nutritionLog = useNutrition((s) => s.log);
  const addWater = useNutrition((s) => s.addWater);
  const stepsFor = useCardio((s) => s.stepsFor);
  const cardioSecFor = useCardio((s) => s.cardioSecFor);
  const weightLogs = useCardio((s) => s.weightLogs);
  const contentSync = useCoachContentSync();
  const { readOnly } = useSubscription();
  const { checkIn } = useActiveCheckIn();
  const unreadMessages = useClientMessageUnread();
  const { items: notifications } = useNotifications();
  const coach = useMyCoach();
  const day = today();

  // Today is always today (P5): a past day picked on another screen never leaks in here.
  useEffect(() => {
    if (useDay.getState().selected !== day) useDay.getState().reset();
  }, [day]);

  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);
  const todayLog = logs.find((l) => l.date === day) ?? null;
  const running = active && active.startedAt && !active.finished ? active : logs.find((l) => l.startedAt && !l.finished) ?? null;
  const nextDay = useMemo(() => (plan && plan.days.length ? plan.days[finished.length % plan.days.length] : null), [plan, finished.length]);
  const draftDay = todayLog && !todayLog.finished && plan ? plan.days.find((d) => d.id === todayLog.dayId) ?? null : null;
  const plannedDay = draftDay ?? nextDay;
  const weekStart = weekStartOf(new Date()).getTime();
  const sessionsThisWeek = finished.filter((l) => weekStartOf(dayKeyToDate(l.date)).getTime() === weekStart).length;
  const planDays = plan?.days.length ?? 0;

  let state: HeroState;
  if (!plan) {
    if (contentSync.status === 'failed') state = 'error';
    else if (contentSync.status === 'idle') state = 'loading';
    else state = account?.assignedCoachId ? 'waiting' : 'no_coach';
  } else if (running) state = 'in_progress';
  else if (todayLog?.finished) state = 'done';
  else if (planDays > 0 && sessionsThisWeek >= planDays) state = 'week_done';
  else state = 'planned';

  // Typical length of this day, from the client's own finished sessions (never a guess).
  const typicalMin = (dayId: string | undefined) => {
    const same = finished.filter((l) => l.dayId === dayId && l.durationSec > 0).slice(0, 5);
    if (!same.length) return null;
    return Math.round(same.reduce((s, l) => s + l.durationSec, 0) / same.length / 60);
  };

  const start = async () => {
    if (readOnly) return;
    if (running) return navigate('/workout/session');
    if (!plannedDay) return;
    await startSession(plannedDay.id);
    useWorkout.getState().beginTimer(); // one tap starts the clock (CL-18)
    navigate('/workout/session');
  };

  // ---- coach attention: at most ONE item, and only when actionable ----
  const coachItem = useMemo(() => {
    if (checkIn?.status === 'requested') return { kind: 'checkin' as const };
    if (unreadMessages > 0) {
      const last = notifications.find((n) => n.type === 'message_received' && !n.seenAt);
      return { kind: 'message' as const, body: last?.body };
    }
    if (plan && isPlanUpdated(uid, 'workout', plan.updatedAt)) return { kind: 'plan' as const };
    const note = notifications.find((n) => n.type === 'coach_note' && !n.seenAt);
    if (note) return { kind: 'note' as const, body: note.body };
    return null;
  }, [checkIn?.status, unreadMessages, notifications, plan, uid]);

  // ---- essentials ----
  const consumed = useMemo(() => computeConsumed(mealPlan, nutritionLog), [mealPlan, nutritionLog]);
  const meals = mealPlan?.meals ?? [];
  const mealsEaten = meals.filter((m) => nutritionLog?.mealsEaten?.[m.id]).length;
  const supps = mealPlan?.supplements ?? [];
  const suppsTaken = supps.filter((s) => nutritionLog?.supplementsTaken?.[s.id]).length;
  const waterTarget = targets?.waterMl ?? 0;
  const water = nutritionLog?.waterMl ?? 0;
  const steps = stepsFor(day);
  const cardioMin = Math.round(cardioSecFor(day) / 60);

  // ---- progress (real data only) ----
  const weightTrend = useMemo(() => {
    if (weightLogs.length < 2) return null;
    const latest = weightLogs[weightLogs.length - 1];
    const cutoff = dayKeyToDate(latest.date).getTime() - 30 * 86_400_000;
    const older = [...weightLogs].reverse().find((w) => dayKeyToDate(w.date).getTime() <= cutoff) ?? weightLogs[0];
    if (older.date === latest.date) return null;
    const days = Math.round((dayKeyToDate(latest.date).getTime() - dayKeyToDate(older.date).getTime()) / 86_400_000);
    return { kg: latest.weightKg, delta: Math.round((latest.weightKg - older.weightKg) * 10) / 10, days };
  }, [weightLogs]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('gt.greetingMorning') : hour < 18 ? t('gt.greetingAfternoon') : t('gt.greetingEvening');
  const firstName = (profile?.name || account?.displayName || '').trim().split(/\s+/)[0];

  const hero = renderHero();

  return (
    <div className="space-y-6 pb-2" data-testid="client-home">
      <header className="pt-1">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em]">{firstName ? `${greeting} ${firstName}` : greeting.replace(/[,،]\s*$/, '')}</h1>
        <p className="mt-1 text-[14px] text-earth-muted">{formatDate(Date.now(), lang, 'full')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          {hero}
          {coachItem && renderCoachItem()}
        </div>

        <div className="space-y-6">
          {(meals.length > 0 || waterTarget > 0 || targets?.steps || targets?.cardioMinutes || supps.length > 0) && (
            <Section title={t('today.essentials')} testId="today-essentials">
              <ListGroup>
                {meals.length > 0 && (
                  <ListRow
                    to="/nutrition"
                    testId="today-row-meals"
                    leading={<IconTile icon="meal" tone="success" />}
                    title={t('today.meals')}
                    meta={`${t('today.mealsMeta', { done: mealsEaten, total: meals.length })} · ${formatNumber(Math.round(consumed.calories), lang)} / ${formatNumber(mealPlan?.targets.calories ?? 0, lang)} ${t('common.kcal')}`}
                    trailing={mealsEaten === meals.length ? <DoneTick /> : null}
                    chevron
                  />
                )}
                {waterTarget > 0 && (
                  <ListRow
                    testId="today-row-water"
                    leading={<IconTile icon="water" tone="info" />}
                    title={t('today.water')}
                    meta={`${formatNumber(water / 1000, lang, { maxFractionDigits: 2 })} / ${formatNumber(waterTarget / 1000, lang, { maxFractionDigits: 2 })} ${t('today.liters')}`}
                    trailing={
                      <IconButton icon="plus" label={t('today.addWater')} disabled={readOnly} onClick={() => void addWater(250)} data-testid="today-add-water" className="border-white/10" />
                    }
                  />
                )}
                {(targets?.steps ?? 0) > 0 ? (
                  <ListRow
                    to="/cardio"
                    testId="today-row-steps"
                    leading={<IconTile icon="activity" tone="info" />}
                    title={t('today.steps')}
                    meta={`${formatNumber(steps, lang)} / ${formatNumber(targets!.steps, lang)}`}
                    trailing={steps >= targets!.steps ? <DoneTick /> : null}
                    chevron
                  />
                ) : (targets?.cardioMinutes ?? 0) > 0 ? (
                  <ListRow
                    to="/cardio"
                    testId="today-row-cardio"
                    leading={<IconTile icon="activity" tone="info" />}
                    title={t('today.cardio')}
                    meta={`${formatNumber(cardioMin, lang)} / ${formatNumber(targets!.cardioMinutes, lang)} ${t('common.min')}`}
                    trailing={cardioMin >= targets!.cardioMinutes ? <DoneTick /> : null}
                    chevron
                  />
                ) : null}
                {supps.length > 0 && (
                  <ListRow
                    to="/nutrition"
                    testId="today-row-supplements"
                    leading={<IconTile icon="pill" tone="neutral" />}
                    title={t('today.supplements')}
                    meta={t('today.suppMeta', { done: suppsTaken, total: supps.length })}
                    trailing={suppsTaken === supps.length ? <DoneTick /> : null}
                    chevron
                  />
                )}
              </ListGroup>
            </Section>
          )}

          {(plan || weightTrend) && (finished.length > 0 || weightTrend) && (
            <Section
              title={t('today.weekTitle')}
              action={
                <button type="button" onClick={() => navigate('/progress')} className="hit-44 text-[14px] font-medium text-brand-hover">
                  {t('today.seeProgress')}
                </button>
              }
              testId="today-progress"
            >
              <div className="grid grid-cols-2 gap-3">
                {plan && planDays > 0 && (
                  <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
                    <p className="text-[13px] text-earth-muted">{t('today.sessions')}</p>
                    <p className="t-numeric mt-1 text-[28px] font-semibold leading-none">
                      {formatNumber(sessionsThisWeek, lang)}
                      <span className="text-[15px] text-earth-muted">/{formatNumber(planDays, lang)}</span>
                    </p>
                    <div className="mt-3 flex gap-1" aria-hidden="true">
                      {Array.from({ length: planDays }, (_, i) => (
                        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < sessionsThisWeek ? 'bg-success' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                )}
                {weightTrend && (
                  <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
                    <p className="text-[13px] text-earth-muted">{t('today.weight')}</p>
                    <p className="t-numeric mt-1 text-[28px] font-semibold leading-none">
                      {formatNumber(weightTrend.kg, lang, { maxFractionDigits: 1 })}
                      <span className="text-[15px] text-earth-muted"> {t('common.kg')}</span>
                    </p>
                    <p className="mt-2 text-[13px] text-earth-muted">
                      <span dir="ltr" className="tabular-nums">{weightTrend.delta > 0 ? '+' : weightTrend.delta < 0 ? '−' : ''}{formatNumber(Math.abs(weightTrend.delta), lang, { maxFractionDigits: 1 })}</span>{' '}
                      {t('today.inDays', { count: weightTrend.days })}
                    </p>
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );

  // ------------------------------------------------------------------ hero
  function renderHero() {
    if (state === 'loading') {
      return (
        <div className="rounded-[20px] border border-white/[0.08] bg-surface-card p-5" role="status" aria-label={t('common.loading')} data-testid="today-hero" data-state="loading">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-8 w-48" />
          <Skeleton className="mt-6 h-12 w-full rounded-full" />
        </div>
      );
    }
    if (state === 'error') {
      return <ErrorState message={t('clientCoach.loadFailed')} onRetry={contentSync.retry ?? undefined} testId="client-home-load-error" />;
    }
    if (state === 'no_coach' || state === 'waiting') {
      const waiting = state === 'waiting';
      return (
        <HeroShell state={state} testId={waiting ? 'waiting-for-coach' : undefined}>
          <IconTile icon={waiting ? 'timer' : 'user'} tone="brand" size={44} />
          <h2 className="mt-4 text-[22px] font-bold leading-tight">{waiting ? t('today.waitingTitle') : t('today.noCoachTitle')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-earth-muted">{waiting ? t('clientCoach.waiting') : t('today.noCoachBody')}</p>
          {waiting && (
            <Button variant="secondary" icon="chat" className="mt-5 w-full" onClick={() => navigate('/messages')}>
              {t('today.messageCoach')}
            </Button>
          )}
        </HeroShell>
      );
    }
    if (state === 'in_progress' && running) {
      const day = plan?.days.find((d) => d.id === running.dayId);
      const s = setsOf(running);
      const pct = s.total ? s.done / s.total : 0;
      return (
        <HeroShell state={state}>
          <p className="text-[13px] font-medium text-brand-hover">{t('today.inProgress')}</p>
          <h2 className="mt-1 text-[30px] font-bold leading-[1.1] tracking-[-0.02em]">{day?.title ?? t('today.sessionLabel')}</h2>
          <p className="mt-3 text-[14px] tabular-nums text-earth-muted">{t('today.setsDone', { done: s.done, total: s.total })}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={s.total} aria-valuenow={s.done}>
            <span className="block h-full rounded-full bg-gradient-brand" style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
          <Button size="lg" icon="play" className="mt-5 w-full" onClick={() => navigate('/workout/session')} data-testid="today-resume">
            {t('today.resume')}
          </Button>
        </HeroShell>
      );
    }
    if (state === 'done' && todayLog) {
      const day = plan?.days.find((d) => d.id === todayLog.dayId);
      const s = setsOf(todayLog);
      return (
        <HeroShell state={state}>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-success text-[#06210f]">
              <Icon name="check" size={20} />
            </span>
            <p className="text-[14px] font-semibold text-success">{t('today.doneTitle')}</p>
          </div>
          <h2 className="mt-3 text-[30px] font-bold leading-[1.1] tracking-[-0.02em]">{day?.title ?? t('today.sessionLabel')}</h2>
          <p className="mt-2 text-[14px] tabular-nums text-earth-muted">
            {t('today.doneMeta', { sets: s.done, min: Math.max(1, Math.round(todayLog.durationSec / 60)) })}
          </p>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => navigate('/workout/session')} data-testid="today-view-session">
            {t('today.viewSession')}
          </Button>
          {nextDay && <p className="mt-3 text-center text-[13px] text-earth-muted">{t('today.nextUp', { title: nextDay.title })}</p>}
        </HeroShell>
      );
    }
    if (state === 'week_done') {
      return (
        <HeroShell state={state}>
          <IconTile icon="trophy" tone="success" size={44} />
          <h2 className="mt-4 text-[22px] font-bold leading-tight">{t('today.weekDoneTitle')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-earth-muted">{t('today.weekDoneBody', { count: planDays })}</p>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => navigate('/workout')}>
            {nextDay ? t('today.nextUp', { title: nextDay.title }) : t('today.viewPlan')}
          </Button>
        </HeroShell>
      );
    }
    // planned
    const d = plannedDay;
    if (!d || !plan) return null;
    const exCount = d.exerciseIds.filter((id) => plan.exercises[id]).length;
    const names = d.exerciseIds.map((id) => plan.exercises[id]?.name).filter(Boolean) as string[];
    const min = typicalMin(d.id);
    return (
      <HeroShell state="planned">
        <p className="text-[13px] font-medium text-brand-hover">
          {t('today.sessionLabel')} · {t('today.dayOf', { n: d.dayIndex + 1, total: planDays })}
        </p>
        <h2 className="mt-1 text-[32px] font-bold leading-[1.08] tracking-[-0.02em]">{d.title}</h2>
        {d.focus ? <p className="mt-1 text-[15px] text-earth-muted">{d.focus}</p> : null}
        <p className="mt-3 text-[14px] tabular-nums text-earth-muted">
          {t('today.exercises', { count: exCount })} · {t('today.sets', { count: plannedSets(d, plan) })}
          {min ? ` · ${t('today.aboutMin', { n: min })}` : ''}
        </p>
        {names.length > 0 && (
          <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-earth">
            {names.slice(0, 3).join(' · ')}
            {names.length > 3 ? ` · ${t('today.more', { count: names.length - 3 })}` : ''}
          </p>
        )}
        {readOnly ? (
          <p className="mt-5 rounded-ui-control bg-white/[0.05] px-3 py-2.5 text-[14px] text-earth-muted" role="status" data-testid="today-readonly">
            {t('today.readOnly')}
          </p>
        ) : (
          <Button size="lg" icon="play" className="mt-5 w-full" onClick={() => void start()} data-testid="today-start">
            {t('today.start')}
          </Button>
        )}
      </HeroShell>
    );
  }

  // ------------------------------------------------------------- coach item
  function renderCoachItem() {
    if (!coachItem) return null;
    const avatar = <Avatar name={coach.name} photoUrl={coach.photoUrl} size="md" />;
    if (coachItem.kind === 'checkin' && checkIn) {
      return (
        <CoachItem testId="home-checkin" onClick={() => navigate(`/check-in/${checkIn.id}`)} leading={<IconTile icon="calendar" tone="warn" size={44} />} title={t('today.coachCheckinTitle')} body={t('today.coachCheckinBody')} cta={t('today.coachCheckinCta')} />
      );
    }
    if (coachItem.kind === 'message') {
      return <CoachItem testId="today-coach-message" onClick={() => navigate('/messages')} leading={avatar} title={t('today.coachMessageTitle', { name: coach.name || t('coachInfo.yourCoach') })} body={coachItem.body} cta={t('today.reply')} />;
    }
    if (coachItem.kind === 'plan') {
      return <CoachItem testId="today-coach-plan" onClick={() => navigate('/workout')} leading={avatar} title={t('today.coachPlanTitle')} body={t('today.coachPlanBody')} cta={t('today.viewPlan')} />;
    }
    return <CoachItem testId="today-coach-note" onClick={() => navigate('/coach-notes')} leading={avatar} title={t('today.coachNoteTitle', { name: coach.name || t('coachInfo.yourCoach') })} body={coachItem.body} cta={t('today.open')} />;
  }
}

function HeroShell({ state, testId, children }: { state: string; testId?: string; children: React.ReactNode }) {
  return (
    <section
      className="relative overflow-hidden rounded-[20px] border border-white/[0.1] bg-gradient-surface-hi p-5 after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-halo after:content-[''] md:p-6"
      data-testid="today-hero"
      data-state={state}
    >
      <div className="relative z-[1]" data-testid={testId}>
        {children}
      </div>
    </section>
  );
}

function CoachItem({ testId, onClick, leading, title, body, cta }: { testId: string; onClick: () => void; leading: React.ReactNode; title: string; body?: string; cta: string }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} className="flex w-full items-center gap-3 rounded-ui-surface border border-white/[0.08] bg-surface-card p-4 text-start transition-colors hover:bg-white/[0.03]">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug">{title}</span>
        {body ? <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-earth-muted">{body}</span> : null}
      </span>
      <span className="shrink-0 text-[14px] font-semibold text-brand-hover">{cta}</span>
    </button>
  );
}

function DoneTick() {
  const { t } = useTranslation();
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-success text-[#06210f]" role="img" aria-label={t('common.done')}>
      <Icon name="check" size={14} />
    </span>
  );
}
