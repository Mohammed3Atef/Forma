import { useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TextAreaField } from '@/components/ui/Field';
import { EntityNotesProvider, type NoteAnchorCtx } from '@/components/EntityNotes';
import { NoteVisibilityToggle } from '@/components/NoteVisibility';
import { ClientActivityView } from '@/pages/coach/ClientActivityView';
import { CoachViewNutrition } from '@/pages/coach/CoachViewNutrition';
import { CoachViewCardio } from '@/pages/coach/CoachViewCardio';
import { CoachViewMeasurements } from '@/pages/coach/CoachViewMeasurements';
import { CoachViewPhotos } from '@/pages/coach/CoachViewPhotos';
import { CoachViewProgress } from '@/pages/coach/CoachViewProgress';
import { CoachCheckIns } from '@/pages/coach/CoachCheckIns';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useSession } from '@/services/auth/sessionStore';
import { addCoachNote, fetchClientLogs, listCoachNotes, type Author } from '@/services/platform/coachApi';
import { getClientMealPlan, getClientWorkoutPlan } from '@/services/platform/planApi';
import { LOG_DAYS, PROGRESS_VIEWS, progressViewOf, weekRows, workspaceBase, type ProgressView } from '@/lib/coachWorkspace';
import { addDays, today as todayKey, weekRange } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { CardioLog, NoteVisibility, NutritionLog, WorkoutLog } from '@/types';

/**
 * Client › Progress (B3.4 / blueprint §6.3): one place for what the client did — a week grid
 * (workouts, meals, cardio per day; tap a day for its full log), nutrition and cardio days, body
 * (weight, measurements with coach entry kept), photos and this coach's check-ins. Replaces the
 * "view as client" layout (RM-20 / CO-20); every view keeps the anchored notes. The view is in
 * the URL (`?view=` `?week=` `?date=`); `…/checkins` (a notification target) opens Check-ins.
 */
export function WorkspaceProgress({ forcedView }: { forcedView?: ProgressView }) {
  const { t } = useTranslation();
  const { clientId = '' } = useParams();
  const navigate = useGuardedNav();
  const [params, setParams] = useSearchParams();
  const view = forcedView ?? progressViewOf(params.get('view'));
  const day = todayKey();
  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const go = (v: ProgressView) => {
    // `…/checkins` is its own URL (stored notification links): leaving it goes to `…/progress`.
    if (forcedView) navigate(`${workspaceBase(clientId)}/progress${v === 'week' ? '' : `?view=${v}`}`, { replace: true });
    else setQuery({ view: v === 'week' ? null : v, date: null });
  };

  let body: ReactNode;
  switch (view) {
    case 'day':
      body = (
        <div className="space-y-3">
          <button type="button" className="chip" data-testid="progress-back-week" onClick={() => setQuery({ view: null, date: null })}>
            <Icon name="chevronLeft" size={14} /> {t('workspace.progress.view.week')}
          </button>
          <ClientActivityView clientId={clientId} date={params.get('date') ?? day} onDateChange={(d) => setQuery({ view: 'day', date: d })} />
        </div>
      );
      break;
    case 'nutrition':
      body = <CoachViewNutrition clientId={clientId} />;
      break;
    case 'cardio':
      body = <CoachViewCardio clientId={clientId} />;
      break;
    case 'body':
      body = (
        <div className="space-y-6">
          <CoachViewProgress clientId={clientId} />
          <CoachViewMeasurements clientId={clientId} />
        </div>
      );
      break;
    case 'photos':
      body = <CoachViewPhotos clientId={clientId} />;
      break;
    case 'checkins':
      body = <CoachCheckIns />;
      break;
    default:
      body = <WeekView clientId={clientId} weekStart={params.get('week')} onWeek={(w) => setQuery({ week: w })} onDay={(d) => setQuery({ view: 'day', date: d })} />;
  }

  return (
    <div className="space-y-4" data-testid="workspace-progress" data-view={view}>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('workspace.section.progress')}>
        {PROGRESS_VIEWS.map((v) => {
          const active = view === v || (v === 'week' && view === 'day');
          return (
            <button key={v} type="button" className={`chip shrink-0 whitespace-nowrap ${active ? 'chip-on' : ''}`} aria-pressed={active} data-testid={`progress-view-${v}`} onClick={() => go(v)}>
              {t(`workspace.progress.view.${v}`)}
            </button>
          );
        })}
      </div>
      <ProgressNotes clientId={clientId}>{body}</ProgressNotes>
    </div>
  );
}

/** The week grid: one row per day (Sat → Fri), from logs already read once for the workspace. */
function WeekView({ clientId, weekStart, onWeek, onDay }: { clientId: string; weekStart: string | null; onWeek: (w: string) => void; onDay: (d: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const day = todayKey();
  const thisWeek = weekRange(day).weekStart;
  const coveredFrom = addDays(day, -(LOG_DAYS - 1));
  const oldestWeek = weekRange(coveredFrom).weekStart;
  const start = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) && weekStart <= thisWeek && weekStart >= oldestWeek ? weekRange(weekStart).weekStart : thisWeek;

  const workouts = useQuery({ queryKey: ['clientLogs', clientId, 'workoutLogs', LOG_DAYS], queryFn: () => fetchClientLogs<WorkoutLog>(clientId, 'workoutLogs', LOG_DAYS), enabled: !!clientId });
  const nutrition = useQuery({ queryKey: ['clientLogs', clientId, 'nutritionLogs', LOG_DAYS], queryFn: () => fetchClientLogs<NutritionLog>(clientId, 'nutritionLogs', LOG_DAYS), enabled: !!clientId });
  const cardio = useQuery({ queryKey: ['clientLogs', clientId, 'cardioLogs', 200], queryFn: () => fetchClientLogs<CardioLog>(clientId, 'cardioLogs', 200), enabled: !!clientId });
  const plan = useQuery({ queryKey: ['clientWorkoutPlan', clientId], queryFn: () => getClientWorkoutPlan(clientId), enabled: !!clientId });
  const meal = useQuery({ queryKey: ['clientMealPlan', clientId], queryFn: () => getClientMealPlan(clientId), enabled: !!clientId });

  const failed = workouts.isError || nutrition.isError || cardio.isError;
  const loading = workouts.isPending || nutrition.isPending || cardio.isPending;
  const rows = useMemo(
    () => (workouts.data && nutrition.data && cardio.data ? weekRows(start, day, { workouts: workouts.data, nutrition: nutrition.data, cardio: cardio.data }, { workout: plan.data, meal: meal.data }, coveredFrom) : []),
    [workouts.data, nutrition.data, cardio.data, plan.data, meal.data, start, day, coveredFrom],
  );
  const doneDays = rows.filter((r) => r.workout === 'done').length;

  return (
    <section className="space-y-3" data-testid="progress-week">
      <div className="flex items-center justify-between rounded-xl border border-line bg-surface-card px-2 py-1.5">
        <button type="button" className="icon-btn h-11 w-11 disabled:opacity-30" aria-label={t('workspace.progress.prevWeek')} disabled={start <= oldestWeek} data-testid="progress-week-prev" onClick={() => onWeek(addDays(start, -7))}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <div className="text-center">
          <p className="text-[14px] font-semibold" data-testid="progress-week-label">
            {start === thisWeek ? t('workspace.progress.thisWeek') : t('workspace.progress.weekOf', { date: formatDate(start, lang, 'dayMonth') })}
          </p>
          <p className="text-[12px] text-earth-subtle">{formatDate(start, lang, 'dayMonth')} – {formatDate(addDays(start, 6), lang, 'dayMonth')}</p>
        </div>
        <button type="button" className="icon-btn h-11 w-11 disabled:opacity-30" aria-label={t('workspace.progress.nextWeek')} disabled={start >= thisWeek} data-testid="progress-week-next" onClick={() => onWeek(addDays(start, 7))}>
          <Icon name="chevron" size={20} />
        </button>
      </div>

      {failed ? (
        <div className="card space-y-2" role="alert" data-testid="progress-week-error">
          <p className="text-[14px] text-danger">{t('workspace.progress.loadFailed')}</p>
          <button type="button" className="btn-ghost w-full" onClick={() => { void workouts.refetch(); void nutrition.refetch(); void cardio.refetch(); }}>{t('common.retry')}</button>
        </div>
      ) : loading ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sk h-12 rounded-xl" />)}</div>
      ) : (
        <>
          <p className="text-[13px] text-earth-muted" data-testid="progress-week-summary">
            {plan.data?.days.length ? t('workspace.progress.weekWorkoutsOfPlan', { done: doneDays, planned: plan.data.days.length }) : t('workspace.progress.weekWorkouts', { count: doneDays })}
          </p>
          <ul className="overflow-hidden rounded-ui-surface border border-white/[0.07] bg-surface-card divide-y divide-white/[0.06]">
            {rows.map((r) => (
              <li key={r.date}>
                <button type="button" className="grid min-h-14 w-full grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-start hover:bg-white/[0.03] md:grid-cols-[7rem_1.4fr_1fr_1fr_auto]" data-testid="progress-day" data-date={r.date} onClick={() => onDay(r.date)}>
                  <span className="text-[13px] font-semibold">{r.date === day ? t('common.today') : formatDate(r.date, lang, 'weekdayShort')}</span>
                  <span className="min-w-0 text-[13px]">
                    {!r.known ? (
                      <span className="text-earth-subtle">—</span>
                    ) : r.workout === 'done' ? (
                      <span className="flex min-w-0 items-center gap-1.5 text-success"><Icon name="check" size={14} /> <span className="truncate">{r.workoutTitle ?? t('workspace.progress.workoutDone')}</span></span>
                    ) : r.workout === 'started' ? (
                      <span className="text-warn">{t('activity.inProgress')}</span>
                    ) : (
                      <span className="text-earth-subtle">{t('workspace.progress.noWorkout')}</span>
                    )}
                    <span className="mt-0.5 block text-[12px] text-earth-subtle md:hidden">
                      {r.known ? `${t('workspace.progress.mealsShort', { eaten: r.mealsEaten, planned: r.mealsPlanned ?? '—' })} · ${t('workspace.progress.cardioShort', { min: r.cardioMin })}` : ''}
                    </span>
                  </span>
                  <span className="hidden text-[13px] text-earth-muted md:block">{r.known ? t('workspace.progress.mealsShort', { eaten: r.mealsEaten, planned: r.mealsPlanned ?? '—' }) : '—'}</span>
                  <span className="hidden text-[13px] text-earth-muted md:block">{r.known ? t('workspace.progress.cardioShort', { min: r.cardioMin }) : '—'}</span>
                  <Icon name="chevron" size={16} className="text-earth-subtle" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Anchored notes on every Progress view (moved from the retired "view as client" layout). */
function ProgressNotes({ clientId, children }: { clientId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const account = useSession((s) => s.account);
  const author: Author = { id: account?.id ?? 'self', role: account?.role ?? 'coach' };
  const notesQ = useQuery({ queryKey: ['coachNotes', clientId], queryFn: () => listCoachNotes(clientId), enabled: !!clientId });
  const [pending, setPending] = useState<NoteAnchorCtx | null>(null);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<NoteVisibility>('private');
  const addNote = useMutation({
    mutationFn: () => addCoachNote(clientId, body.trim(), author, 'note', { screen: pending?.screen, date: pending?.date, entityType: pending?.entityType, entityId: pending?.entityId }, visibility),
    onSuccess: () => {
      setBody('');
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['coachNotes', clientId] });
    },
  });
  return (
    <>
      <EntityNotesProvider notes={notesQ.data ?? []} onAdd={(ctx) => { setBody(''); setVisibility('private'); addNote.reset(); setPending(ctx); }}>
        {children}
      </EntityNotesProvider>
      <Sheet open={!!pending} onClose={() => setPending(null)} size="md" title={pending?.label ? t('notes.noteOn', { name: pending.label }) : t('coach.addNote')}>
        <TextAreaField label={t('field.notes')} className="min-h-28" data-testid="entity-note-body" placeholder={t('coach.notePlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
        <NoteVisibilityToggle value={visibility} onChange={setVisibility} />
        {addNote.isError && <p className="mt-2 text-sm text-danger" role="alert">{t('trust.notes.saveFailed')}</p>}
        <button type="button" data-testid="entity-note-save" disabled={!body.trim() || addNote.isPending} onClick={() => addNote.mutate()} className="btn-primary mt-3 w-full disabled:opacity-40">
          {t('common.save')}
        </button>
      </Sheet>
    </>
  );
}
