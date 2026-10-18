import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { NoteVisibilityBadge } from '@/components/NoteVisibility';
import { CheckInReviewForm } from '@/components/coach/CheckInReview';
import { useCoachSources } from '@/hooks/useCoachSources';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientLogs, listCoachNotes } from '@/services/platform/coachApi';
import { getClientCardioPlan, getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { requestCheckIn } from '@/services/platform/checkInApi';
import { alertDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { buildTodayQueue, type TodayItem, type TodayKind } from '@/lib/coachToday';
import { buildDirectory, bulkCheckInEligible } from '@/lib/coachDirectory';
import { LOG_DAYS, sectionPath, trainingStats, weightTrend, workspaceBase } from '@/lib/coachWorkspace';
import { addDays, today as todayKey, weekRange } from '@/lib/utils';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useTodayReason } from '@/pages/coach/today/TodayRow';
import type { WeightLog, WorkoutLog } from '@/types';

const KIND_ICON: Record<TodayKind, IconName> = {
  checkin: 'check',
  assessment: 'list',
  freeze: 'clock',
  transfer: 'users',
  message: 'chat',
  renewal: 'calendar',
  lapsed: 'calendar',
  noPlan: 'dumbbell',
  inactive: 'activity',
};

/**
 * Client › Summary (B3.4 / blueprint §6.3): what this client needs from the coach now (exactly
 * Today's items for them — a check-in is reviewed in place), then this week against the plan,
 * body, the plan, check-ins and the latest note. Every number names its window and comes from
 * stored logs; a source that fails says so (never a zero or an "all good").
 */
export function WorkspaceSummary() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useGuardedNav();
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const now = Date.now();
  const day = todayKey();
  const week = weekRange(day);

  // This client's open items — the same sources and rules as Today and Clients.
  const { sources, refresh } = useCoachSources(coachId);
  const queue = useMemo(() => buildTodayQueue(sources, { coachId, now, todayKey: day }), [sources, coachId, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = queue.items.filter((i) => i.clientId === clientId);
  const anyFailed = Object.values(queue.status).some((s) => s === 'error');
  const anyLoading = Object.values(queue.status).some((s) => s === 'loading');
  const row = useMemo(() => buildDirectory(sources, { coachId, now, todayKey: day, weekStart: week.weekStart }).rows.find((r) => r.id === clientId) ?? null, [sources, coachId, day, week.weekStart, clientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const reason = useTodayReason();

  const workouts = useQuery({ queryKey: ['clientLogs', clientId, 'workoutLogs', LOG_DAYS], queryFn: () => fetchClientLogs<WorkoutLog>(clientId, 'workoutLogs', LOG_DAYS), enabled: !!clientId });
  const weights = useQuery({ queryKey: ['clientLogs', clientId, 'weightLogs', LOG_DAYS], queryFn: () => fetchClientLogs<WeightLog>(clientId, 'weightLogs', LOG_DAYS), enabled: !!clientId });
  const workoutPlan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const mealPlan = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });
  const cardioPlan = useQuery({ queryKey: ['clientCardioPlan', clientId], queryFn: () => getClientCardioPlan(clientId), enabled: !!clientId });
  const notes = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });

  const training = workouts.data ? trainingStats(workouts.data, workoutPlan.data ?? null, day, week.weekStart) : null;
  const body = weights.data ? weightTrend(weights.data, day) : null;
  const latestNote = notes.data ? [...notes.data].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null : null;

  const [reviewing, setReviewing] = useState<TodayItem | null>(null);
  const request = useMutation({
    mutationFn: () => requestCheckIn(coachId, clientId, week.weekStart, addDays(week.weekStart, 6)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['coachCheckInSummaries', coachId] });
      void qc.invalidateQueries({ queryKey: ['checkIns', clientId] });
      showToast({ title: t('workspace.summary.checkinRequested'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('checkin.request'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const canRequest = !!row && bulkCheckInEligible(row);

  const openItem = (it: TodayItem) => {
    if (it.kind === 'checkin' && it.checkIn) setReviewing(it);
    else navigate(it.to);
  };
  const base = workspaceBase(clientId);
  const card = 'card space-y-3';
  const kv = (label: string, value: string, testId?: string) => (
    <div className="min-w-0">
      <p className="text-[12px] text-earth-subtle">{label}</p>
      <p className="truncate text-[18px] font-semibold tabular-nums text-earth" data-testid={testId}>{value}</p>
    </div>
  );
  const failed = (onRetry: () => void) => (
    <p className="flex flex-wrap items-center gap-2 text-[13px] text-earth-muted" role="alert">
      <Icon name="alert" size={15} className="text-warn" /> {t('workspace.summary.couldNotLoad')}
      <button type="button" className="hit-44 font-semibold text-brand-hover" onClick={onRetry}>{t('common.retry')}</button>
    </p>
  );

  return (
    <div className="w-full space-y-4" data-testid="coach-client-detail">
      <div className="flex flex-wrap gap-2" data-testid="summary-actions">
        <Button icon="list" variant="secondary" size="sm" onClick={() => navigate(sectionPath(clientId, 'plan'), { replace: true })}>
          {t('workspace.editPlan')}
        </Button>
        {canRequest ? (
          <Button icon="calendar" variant="ghost" size="sm" data-testid="summary-request-checkin" disabled={!online || request.isPending} pending={request.isPending} onClick={() => request.mutate()}>
            {t('workspace.summary.requestCheckin')}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Needs you — exactly Today's items for this client. */}
          <section className={card} data-testid="summary-needs">
            <h2 className="text-[15px] font-semibold">{t('workspace.summary.needsTitle')}</h2>
            {items.length > 0 ? (
              <ul className="divide-y divide-line-soft">
                {items.map((it) => (
                  <li key={it.key}>
                    <button type="button" className="flex w-full items-center gap-3 py-2.5 text-start" data-testid="summary-item" data-kind={it.kind} onClick={() => openItem(it)}>
                      <span className="row-av h-9 w-9 shrink-0 bg-brand/15 text-brand"><Icon name={KIND_ICON[it.kind]} size={16} /></span>
                      <span className="min-w-0 flex-1 text-[14px] leading-snug">{reason(it, now)}</span>
                      <span className="shrink-0 text-[13px] font-semibold text-brand-hover">{t(`coachToday.action.${it.kind}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : anyFailed ? (
              failed(refresh)
            ) : anyLoading ? (
              <div className="sk h-10 rounded-xl" aria-busy="true" />
            ) : (
              <p className="text-[14px] text-earth-muted" data-testid="summary-nothing">{t('workspace.summary.nothing')}</p>
            )}
            {items.length > 0 && anyFailed ? failed(refresh) : null}
          </section>

          {/* This week against the plan, and the windows around it. */}
          <section className={card} data-testid="summary-training">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t('workspace.summary.trainingTitle')}</h2>
              <button type="button" className="text-[13px] font-semibold text-brand-hover" onClick={() => navigate(`${base}/progress`, { replace: true })}>{t('workspace.summary.seeProgress')}</button>
            </div>
            {workouts.isError ? (
              failed(() => void workouts.refetch())
            ) : !training ? (
              <div className="sk h-14 rounded-xl" aria-busy="true" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {kv(t('workspace.summary.thisWeek'), training.planDays ? t('workspace.summary.ofPlanned', { done: training.doneThisWeek, planned: training.planDays }) : String(training.doneThisWeek), 'summary-this-week')}
                  {kv(t('workspace.summary.last7'), String(training.last7), 'summary-last7')}
                  {kv(t('workspace.summary.last28'), String(training.last28), 'summary-last28')}
                </div>
                <p className="text-[13px] text-earth-muted" data-testid="summary-last-workout">
                  {training.lastWorkout
                    ? t('workspace.summary.lastWorkout', { date: formatDate(training.lastWorkout, lang, 'weekdayDayMonth') })
                    : t('workspace.summary.noWorkout28')}
                  {training.planDays == null && !workoutPlan.isPending && !workoutPlan.isError ? ` · ${t('workspace.summary.noTrainingPlan')}` : ''}
                </p>
              </>
            )}
          </section>

          <section className={card} data-testid="summary-body">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t('workspace.summary.bodyTitle')}</h2>
              <button type="button" className="text-[13px] font-semibold text-brand-hover" onClick={() => navigate(`${base}/progress?view=body`, { replace: true })}>{t('workspace.summary.seeBody')}</button>
            </div>
            {weights.isError ? (
              failed(() => void weights.refetch())
            ) : !body ? (
              <div className="sk h-10 rounded-xl" aria-busy="true" />
            ) : body.latest ? (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
                {kv(t('workspace.summary.latestWeight', { date: formatDate(body.latest.date, lang, 'dayMonth') }), `${formatNumber(body.latest.kg, lang)} ${t('common.kg')}`, 'summary-weight')}
                {body.change ? (
                  <p className="pb-0.5 text-[13px] text-earth-muted" data-testid="summary-weight-change">
                    {/* The signed number is isolated left-to-right, so the minus stays in front in Arabic. */}
                    {t('workspace.summary.weightChange', { delta: `\u2066${body.change.kg > 0 ? '+' : ''}${formatNumber(body.change.kg, lang)}\u2069`, date: formatDate(body.change.from, lang, 'dayMonth') })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-[14px] text-earth-muted">{t('workspace.summary.noWeight')}</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className={card} data-testid="summary-plan">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t('workspace.section.plan')}</h2>
              <button type="button" className="text-[13px] font-semibold text-brand-hover" onClick={() => navigate(sectionPath(clientId, 'plan'), { replace: true })}>{t('workspace.summary.openPlan')}</button>
            </div>
            <ul className="space-y-1.5 text-[14px]">
              <li className="flex items-center gap-2"><Icon name="dumbbell" size={15} className="text-earth-subtle" />
                {workoutPlan.isError ? '—' : workoutPlan.isPending ? '…' : workoutPlan.data ? t('workspace.plan.workoutLine', { name: workoutPlan.data.name || t('coach.kind.workout'), count: workoutPlan.data.days.length }) : t('workspace.plan.noWorkout')}
              </li>
              <li className="flex items-center gap-2"><Icon name="meal" size={15} className="text-earth-subtle" />
                {mealPlan.isError ? '—' : mealPlan.isPending ? '…' : mealPlan.data ? t('workspace.plan.nutritionLine', { kcal: formatNumber(mealPlan.data.targets.calories, lang), count: mealPlan.data.meals.length }) : t('workspace.plan.noNutrition')}
              </li>
              <li className="flex items-center gap-2"><Icon name="activity" size={15} className="text-earth-subtle" />
                {cardioPlan.isError ? '—' : cardioPlan.isPending ? '…' : cardioPlan.data && cardioPlan.data.sessions.length ? t('workspace.plan.cardioLine', { count: cardioPlan.data.sessions.length }) : t('workspace.plan.noCardio')}
              </li>
            </ul>
          </section>

          <section className={card} data-testid="summary-checkins">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t('checkin.title')}</h2>
              <button type="button" className="text-[13px] font-semibold text-brand-hover" onClick={() => navigate(`${base}/progress?view=checkins`, { replace: true })}>{t('workspace.summary.seeCheckins')}</button>
            </div>
            <p className="text-[14px]" data-testid="summary-checkin-state">
              {row?.checkIn ? t(`coachClients.checkin.${row.checkIn}`) : sources.checkIns.error ? '—' : '…'}
            </p>
          </section>

          <section className={card} data-testid="summary-note">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t('workspace.summary.latestNote')}</h2>
              <button type="button" className="text-[13px] font-semibold text-brand-hover" onClick={() => navigate(`${base}/notes`, { replace: true })}>{t('workspace.summary.allNotes')}</button>
            </div>
            {notes.isError ? (
              failed(() => void notes.refetch())
            ) : notes.isPending ? (
              <div className="sk h-10 rounded-xl" aria-busy="true" />
            ) : latestNote ? (
              <div>
                <p className="line-clamp-3 whitespace-pre-wrap text-[14px]" dir="auto">{latestNote.body}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <NoteVisibilityBadge visibility={latestNote.visibility} />
                  <span className="text-[12px] text-earth-subtle">{formatRelative(latestNote.createdAt, lang, now)}</span>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-earth-muted">{t('coach.noNotes')}</p>
            )}
          </section>
        </div>
      </div>

      <Sheet open={!!reviewing} onClose={() => setReviewing(null)} size="lg" title={t('checkin.title')}>
        {reviewing?.checkIn ? (
          <CheckInReviewForm
            clientId={clientId}
            coachId={coachId}
            checkIn={reviewing.checkIn}
            previous={reviewing.previousCheckIn}
            showContext={false}
            onReviewed={() => setReviewing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
