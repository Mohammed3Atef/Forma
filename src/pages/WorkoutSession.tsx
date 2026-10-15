import { useEffect, useMemo, useState } from 'react';
import { readLive, writeLive } from '@/lib/liveState';
import { isPlayableVideoUrl } from '@/lib/videoSource';
import { normalizeNumericText } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { useSubscription } from '@/hooks/useSubscription';
import { useSettings } from '@/stores/settingsStore';
import { useDay } from '@/stores/dayStore';
import { useTimer } from '@/stores/timerStore';
import { playVideo } from '@/stores/mediaViewerStore';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useElapsed } from '@/hooks/useElapsed';
import { ExerciseCard } from '@/components/ExerciseCard';
import { RestTimerBar } from '@/components/RestTimerBar';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Button, IconButton } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { formatDuration, formatNumber } from '@/lib/format';
import { logSetCount, logExerciseCount, prByExercise } from '@/lib/calc';
import { muscleColor, muscleLabel } from '@/lib/muscle';
import { HAPTIC, vibrate } from '@/lib/haptics';
import { confirmDialog } from '@/stores/dialogStore';
import { useBack } from '@/hooks/useBack';
import type { WorkoutLog } from '@/types';

/*
 * TRAIN › SESSION (B2.3) — a focused, full-screen task (doc 17 D8): no tab
 * bar, no banners. One exercise at a time with an "Up next" preview; the
 * primary actions sit in a bottom action bar in the thumb zone (CL-19 / JR-08):
 * Previous · Next exercise · Finish. The timer starts when the client taps
 * Start on Today / Train (no second "Start" here, CL-18); a draft opened some
 * other way starts on the first ticked set or the Start button.
 *
 * Unchanged from B0/B1 (the store owns them): ticking commits the shown
 * values and refuses an empty row (CL-17); the session is dated today; it
 * survives reload / OS kill (liveState keeps the exercise position, the store
 * keeps every set); the rest timer is timestamp-driven; critical work holds
 * app updates back.
 */
export function WorkoutSession() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  // Every exit agrees with browser Back: wherever the session was opened from,
  // else its semantic parent (Train).
  const goBack = useBack('/workout');

  const plan = useWorkout((s) => s.plan);
  const active = useWorkout((s) => s.active);
  const logs = useWorkout((s) => s.logs);
  const setDay = useDay((s) => s.setDay);
  const updateSet = useWorkout((s) => s.updateSet);
  const toggleSetDone = useWorkout((s) => s.toggleSetDone);
  const addSet = useWorkout((s) => s.addSet);
  const removeSet = useWorkout((s) => s.removeSet);
  const addExercise = useWorkout((s) => s.addExercise);
  const removeExercise = useWorkout((s) => s.removeExercise);
  const undoRemoveExercise = useWorkout((s) => s.undoRemoveExercise);
  const restoreDayExercises = useWorkout((s) => s.restoreDayExercises);
  const lastRemoved = useWorkout((s) => s.lastRemoved);
  const beginTimer = useWorkout((s) => s.beginTimer);
  const discardDraft = useWorkout((s) => s.discardDraft);
  const discardActive = useWorkout((s) => s.discardActive);
  const finishSession = useWorkout((s) => s.finishSession);
  const previousFor = useWorkout((s) => s.previousFor);

  const { readOnly: subReadOnly, ended: subEnded } = useSubscription();
  const restDefault = useSettings((s) => s.settings?.restDefaultSec ?? 90);
  const startRest = useTimer((s) => s.startRest);
  const timerOn = useTimer((s) => s.running || s.paused);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [durationMin, setDurationMin] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<null | { log: WorkoutLog; prs: { name: string; kg: number; reps: number }[] }>(null);
  // Finished sessions open read-only; editing is an explicit choice.
  const [editMode, setEditMode] = useState(false);

  const running = !!active?.startedAt && !active?.finished;
  useWakeLock(running);
  const ticking = useElapsed(active && !active.finished ? active.startedAt : null);
  const elapsed = active?.finished ? active.durationSec : ticking;

  const activeId = active?.id;
  useEffect(() => {
    setEditMode(false);
  }, [activeId]);

  // One exercise at a time; the position survives reload / OS kill (PWA-07).
  const [currentIndex, setCurrentIndex] = useState(0);
  useEffect(() => {
    const saved = readLive().session;
    setCurrentIndex(activeId && saved?.logId === activeId ? saved.index : 0);
  }, [activeId]);
  useEffect(() => {
    if (activeId) writeLive({ session: { logId: activeId, index: currentIndex } });
  }, [activeId, currentIndex]);
  const exerciseCount = active?.exercises.length ?? 0;
  useEffect(() => {
    setCurrentIndex((i) => Math.min(i, Math.max(0, exerciseCount - 1)));
  }, [exerciseCount]);

  const totalSets = active?.exercises.reduce((a, e) => a + e.sets.length, 0) ?? 0;
  const doneSets = active?.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) ?? 0;

  const availableToAdd = useMemo(() => {
    if (!plan || !active) return [];
    const inSession = new Set(active.exercises.map((e) => e.exerciseId));
    const q = search.trim().toLowerCase();
    return Object.values(plan.exercises)
      .filter((ex) => !inSession.has(ex.id))
      .filter((ex) => !q || ex.name.toLowerCase().includes(q) || ex.targetMuscle.toLowerCase().includes(q));
  }, [plan, active, search]);

  // After a reload the in-memory session is gone: a STARTED workout is
  // persisted, so focus its day and the store re-points `active` at it.
  const unfinished = useMemo(() => (active ? null : logs.find((l) => l.startedAt && !l.finished) ?? null), [active, logs]);
  useEffect(() => {
    if (unfinished) setDay(unfinished.date);
  }, [unfinished, setDay]);

  // Subscription frozen/ended → logging is paused (view-only); say so, offer Train.
  if (subReadOnly) {
    return (
      <StateScreen icon="lock" title={t(subEnded ? 'subscription.bannerEnded' : 'subscription.bannerFrozen')} action={t('session.backToTrain')} onAction={() => navigate('/workout')} />
    );
  }
  // Nothing to resume (a cold deep link): explain and offer Train (CL-50).
  if (!plan || (!active && !unfinished)) {
    return <StateScreen icon="dumbbell" title={t('workout.noActiveSession')} body={t('session.noActiveBody')} action={t('session.backToTrain')} onAction={() => navigate('/workout')} />;
  }
  if (!active) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center" role="status">
        <Icon name="rotate" size={22} className="animate-spin text-earth-subtle motion-reduce:animate-none" />
        <p className="text-earth-muted">{t('session.resuming')}</p>
      </div>
    );
  }

  const day = plan.days.find((d) => d.id === active.dayId);
  const recording = !!active.startedAt || active.finished;
  const missingFromPlan = day ? day.exerciseIds.filter((id) => !active.exercises.some((e) => e.exerciseId === id)).length : 0;

  const minimize = () => {
    discardDraft(); // no-op once started/saved
    goBack();
  };

  const handleToggle = (exerciseId: string, setIndex: number) => {
    const ex = active.exercises.find((e) => e.exerciseId === exerciseId);
    const wasDone = ex?.sets.find((s) => s.setIndex === setIndex)?.done;
    const ok = toggleSetDone(exerciseId, setIndex);
    if (ok && !wasDone) {
      vibrate(HAPTIC.success);
      startRest(plan.exercises[exerciseId]?.restSec ?? restDefault);
    }
    return ok;
  };

  // A video button exists only when the coach's link can play (B0 / CL-20).
  const videoFor = (exerciseId: string): (() => void) | undefined => {
    const url = plan.exercises[exerciseId]?.videoUrl;
    return isPlayableVideoUrl(url) ? () => playVideo(url!) : undefined;
  };

  const doSave = async () => {
    const mins = Number(durationMin);
    const override = Number.isFinite(mins) && mins > 0 ? mins * 60 : undefined;
    const before = prByExercise(logs.filter((l) => l.id !== active.id));
    const saved = await finishSession(override);
    if (saved) {
      // Personal bests: only against real history (a first-ever lift isn't a "PR").
      const now = prByExercise([saved]);
      const prs: { name: string; kg: number; reps: number }[] = [];
      now.forEach((pr, id) => {
        const prev = before.get(id);
        if (prev && pr.e1rm > prev.e1rm) prs.push({ name: plan.exercises[id]?.name ?? id, kg: pr.kg, reps: pr.reps });
      });
      setSummary({ log: saved, prs });
    }
    setConfirmOpen(false);
  };

  const doDiscard = async () => {
    const ok = await confirmDialog({
      title: t('session.discardTitle'),
      message: t('gt.discardConfirm'),
      confirmLabel: t('gt.discard'),
      danger: true,
    });
    if (!ok) return;
    setConfirmOpen(false);
    await discardActive();
    goBack();
  };

  const openFinish = () => {
    setDurationMin(String(Math.max(1, Math.round(elapsed / 60))));
    setConfirmOpen(true);
  };

  // ---------------------------------------------------------------- summary
  if (summary) {
    const s = summary.log;
    return (
      <div className="flex min-h-[85vh] flex-col items-center justify-center py-8 text-center" data-testid="session-summary">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-success text-[#06210f] shadow-[0_0_48px_rgba(63,178,127,0.35)]">
          <Icon name="check" size={36} />
        </span>
        <p className="mt-6 text-[15px] font-semibold text-success">{t('gt.workoutComplete')}</p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight">{day?.title ?? t('workout.session')}</h1>
        <div className="mt-8 grid w-full max-w-sm grid-cols-3 divide-x divide-white/[0.08] rounded-ui-surface border border-white/[0.08] bg-surface-card py-4 rtl:divide-x-reverse">
          <Stat value={formatDuration(s.durationSec)} label={t('gt.duration')} />
          <Stat value={formatNumber(logSetCount(s), lang)} label={t('gt.setsDone')} />
          <Stat value={formatNumber(logExerciseCount(s), lang)} label={t('gt.exercises')} />
        </div>
        {summary.prs.length > 0 && (
          <div className="mt-6 w-full max-w-sm text-start" data-testid="session-prs">
            <p className="mb-2 text-[15px] font-semibold">
              <span className="bg-gradient-gold bg-clip-text text-transparent">{t('session.newBests', { count: summary.prs.length })}</span>
            </p>
            <ListGroup>
              {summary.prs.map((p) => (
                <ListRow key={p.name} leading={<Icon name="trophy" size={20} className="text-brand-hover" />} title={p.name} trailing={<span className="font-mono text-[15px]" dir="ltr">{formatNumber(p.kg, lang)} × {p.reps}</span>} />
              ))}
            </ListGroup>
          </div>
        )}
        <Button size="lg" className="mt-8 w-full max-w-sm" onClick={goBack}>
          {t('common.done')}
        </Button>
      </div>
    );
  }

  // ------------------------------------------------ finished, read-only view
  if (active.finished && !editMode) {
    return (
      <div className="flex min-h-dvh flex-col" data-testid="session-review">
        <SessionHeader
          start={<IconButton icon="chevronDown" label={t('common.minimize')} onClick={minimize} className="border-transparent" />}
          title={day?.title ?? t('workout.session')}
          sub={<span className="text-success">{t('gt.workoutComplete')}</span>}
          end={<Button variant="secondary" size="sm" icon="edit" onClick={() => setEditMode(true)}>{t('common.edit')}</Button>}
        />
        <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.08] rounded-ui-surface border border-white/[0.08] bg-surface-card py-4 rtl:divide-x-reverse">
          <Stat value={formatDuration(active.durationSec)} label={t('gt.duration')} />
          <Stat value={formatNumber(logSetCount(active), lang)} label={t('gt.setsDone')} />
          <Stat value={formatNumber(logExerciseCount(active), lang)} label={t('gt.exercises')} />
        </div>
        <div className="mt-6 space-y-5 pb-8">
          {active.exercises.map((log) => {
            const ex = plan.exercises[log.exerciseId];
            if (!ex) return null;
            let workingNo = 0;
            return (
              <section key={log.exerciseId}>
                <h2 className="mb-2 flex items-center gap-2 text-[16px] font-semibold">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: muscleColor(ex.targetMuscle) }} aria-hidden="true" />
                  {ex.name}
                </h2>
                <ListGroup>
                  {log.sets.map((s) => {
                    const label = s.type === 'warmup' ? 'W' : String((workingNo += 1));
                    return (
                      <div key={s.setIndex} className="flex min-h-12 items-center gap-3 px-4 text-[15px]">
                        <span className="w-6 font-mono font-semibold text-earth-muted">{label}</span>
                        <span className="flex-1 font-mono" dir="ltr">
                          {s.weightKg ?? '–'} {t('common.kg')} × {s.actualReps ?? '–'}
                        </span>
                        {s.done ? <Icon name="check" size={18} className="text-success" /> : null}
                      </div>
                    );
                  })}
                </ListGroup>
              </section>
            );
          })}
          <Button size="lg" className="w-full" onClick={goBack}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ live session
  const idx = Math.min(currentIndex, active.exercises.length - 1);
  const log = active.exercises[idx];
  const ex = log ? plan.exercises[log.exerciseId] : undefined;
  const upNext = active.exercises.slice(idx + 1, idx + 3);
  const isLast = idx >= active.exercises.length - 1;
  const pct = totalSets ? (doneSets / totalSets) * 100 : 0;

  return (
    <div className="flex min-h-dvh flex-col" data-testid="workout-session">
      <SessionHeader
        start={<IconButton icon="chevronDown" label={t('common.minimize')} onClick={minimize} className="border-transparent" />}
        title={day?.title ?? t('workout.session')}
        sub={
          recording ? (
            <span className="font-mono text-[20px] font-semibold tabular-nums text-earth" dir="ltr">
              {formatDuration(elapsed)}
            </span>
          ) : (
            <span className="text-earth-muted">{t('workout.notStarted')}</span>
          )
        }
        end={
          <ActionMenu
            label={t('session.options')}
            testId="session-menu"
            items={[
              { key: 'add', label: t('gt.addExercise'), icon: 'plus', onSelect: () => setPickerOpen(true), testId: 'session-add-exercise' },
              ...(missingFromPlan > 0 ? [{ key: 'restore', label: `${t('gt.restorePlanExercises')} (${missingFromPlan})`, icon: 'rotate' as const, onSelect: restoreDayExercises }] : []),
              { key: 'discard', label: t('session.discardWorkout'), icon: 'trash', danger: true, onSelect: () => void doDiscard() },
            ]}
          />
        }
      />

      {/* Progress through the whole session */}
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={totalSets} aria-valuenow={doneSets} aria-label={t('gt.setsCount', { done: doneSets, total: totalSets })}>
          <span className="block h-full rounded-full bg-gradient-brand transition-[width] duration-ui-base" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[14px] text-earth-muted">
          <span className="tabular-nums">{t('gt.setsCount', { done: doneSets, total: totalSets })}</span>
          <span>{t('workout.exerciseOf', { i: idx + 1, n: active.exercises.length })}</span>
        </div>
      </div>

      {lastRemoved && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-ui-control border border-white/[0.1] bg-surface-raised px-4 py-2.5" role="status">
          <span className="min-w-0 truncate text-[14px] text-earth-muted">
            {t('gt.exerciseRemoved')}
            {plan.exercises[lastRemoved.log.exerciseId] ? ` · ${plan.exercises[lastRemoved.log.exerciseId].name}` : ''}
          </span>
          <button type="button" onClick={undoRemoveExercise} className="hit-44 flex shrink-0 items-center gap-1.5 text-[14px] font-semibold text-brand-hover">
            <Icon name="rotate" size={16} /> {t('gt.undo')}
          </button>
        </div>
      )}

      <div className="mt-5 flex-1">
        {log && ex ? (
          <ExerciseCard
            key={log.exerciseId}
            exercise={ex}
            log={log}
            prev={previousFor(log.exerciseId)}
            onUpdateSet={(setIndex, patch) => updateSet(log.exerciseId, setIndex, patch)}
            onToggleDone={(setIndex) => handleToggle(log.exerciseId, setIndex)}
            onAddSet={() => addSet(log.exerciseId)}
            onRemoveSet={(setIndex) => removeSet(log.exerciseId, setIndex)}
            onVideo={videoFor(log.exerciseId)}
            onRemoveExercise={active.exercises.length > 1 ? () => removeExercise(log.exerciseId) : undefined}
          />
        ) : null}

        {upNext.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-[15px] font-semibold text-earth-muted">{t('workout.upNext')}</h2>
            <ListGroup>
              {upNext.map((nl, i) => {
                const nex = plan.exercises[nl.exerciseId];
                if (!nex) return null;
                const first = previousFor(nl.exerciseId)?.sets[0];
                const prevLabel = first && (first.weightKg != null || first.actualReps != null) ? t('workout.lastTime', { weight: first.weightKg ?? '–', reps: first.actualReps ?? '–' }) : null;
                return (
                  <ListRow
                    key={nl.exerciseId}
                    onClick={() => setCurrentIndex(idx + 1 + i)}
                    leading={<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: muscleColor(nex.targetMuscle) }} aria-hidden="true" />}
                    title={nex.name}
                    meta={`${muscleLabel(nex.targetMuscle, t)} · ${nl.sets.length} × ${nl.sets[0]?.targetReps || '–'}${prevLabel ? ` · ${prevLabel}` : ''}`}
                    chevron
                  />
                );
              })}
            </ListGroup>
          </section>
        )}
        {/* Room for the pinned action bar (+ rest timer). */}
        <div aria-hidden="true" className={timerOn ? 'h-56' : 'h-32'} />
      </div>

      {/* Bottom action stack: rest timer above the action bar, both in thumb reach. */}
      <div className="fixed inset-x-0 bottom-0 z-ui-nav" style={{ paddingBottom: 'var(--shell-safe-bottom)' }}>
        <div className="mx-auto w-full max-w-xl space-y-2 px-4 pb-3 md:px-6">
          {timerOn && <RestTimerBar />}
          <div className="flex items-center gap-2 rounded-ui-surface border border-white/[0.1] bg-surface/95 p-2 shadow-ui-sticky backdrop-blur-md" data-testid="session-actions">
            <IconButton icon="chevronLeft" label={t('common.previous')} disabled={idx === 0} onClick={() => setCurrentIndex(idx - 1)} className="h-14 w-14 shrink-0 rounded-ui-control border-white/[0.12] disabled:opacity-30" />
            {!recording ? (
              <Button size="lg" icon="play" className="h-14 flex-1" onClick={beginTimer}>
                {t('common.start')}
              </Button>
            ) : isLast ? (
              <Button size="lg" className="h-14 flex-1" onClick={openFinish}>
                {t('session.finishWorkout')}
              </Button>
            ) : (
              <>
                <Button variant="secondary" size="lg" className="h-14 flex-1" onClick={() => setCurrentIndex(idx + 1)}>
                  {t('session.nextExercise')}
                </Button>
                <Button variant="ghost" size="lg" className="h-14 shrink-0 px-4" onClick={openFinish}>
                  {t('common.finish')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Finish */}
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('gt.finishWorkoutQ')}>
        <p className="mb-4 text-[15px] tabular-nums text-earth-muted">{t('gt.setsCount', { done: doneSets, total: totalSets })}</p>
        <label className="mb-1.5 block text-[14px] font-medium" htmlFor="finish-duration">
          {t('gt.durationMin')}
        </label>
        <input
          id="finish-duration"
          inputMode="numeric"
          dir="ltr"
          value={durationMin}
          onChange={(e) => setDurationMin(normalizeNumericText(e.target.value).replace(/[^\d]/g, ''))}
          onFocus={(e) => e.currentTarget.select()}
          className="input mb-5 h-14 text-[17px]"
        />
        <div className="space-y-2.5">
          <Button size="lg" className="w-full" onClick={() => void doSave()}>
            {t('gt.saveWorkout')}
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => setConfirmOpen(false)}>
            {t('gt.keepGoing')}
          </Button>
        </div>
      </Sheet>

      {/* Add exercise */}
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={t('gt.addExercise')}>
        <div className="relative mb-3">
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-earth-subtle">
            <Icon name="search" size={18} />
          </span>
          <input className="input ps-10" placeholder={t('gt.searchExercises')} aria-label={t('gt.searchExercises')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {availableToAdd.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                onClick={() => {
                  addExercise(x.id);
                  setPickerOpen(false);
                  setSearch('');
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-ui-control px-2 text-start hover:bg-white/[0.04]"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: muscleColor(x.targetMuscle) }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{x.name}</span>
                  <span className="block text-[13px] text-earth-muted">{muscleLabel(x.targetMuscle, t)}</span>
                </span>
                <Icon name="plus" size={20} className="text-brand-hover" />
              </button>
            </li>
          ))}
          {availableToAdd.length === 0 && <li className="py-6 text-center text-[14px] text-earth-subtle">{t('session.nothingToAdd')}</li>}
        </ul>
      </Sheet>
    </div>
  );
}

function SessionHeader({ start, title, sub, end }: { start: React.ReactNode; title: string; sub: React.ReactNode; end: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-ui-header -mx-4 flex items-center gap-2 border-b border-white/[0.06] bg-surface/95 px-2 py-2 backdrop-blur-md md:-mx-6"
      style={{ paddingTop: 'max(0.5rem, var(--shell-safe-top))', marginTop: 'calc(-1 * var(--shell-safe-top))' }}
    >
      <div className="shrink-0">{start}</div>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        <div className="text-[13px] leading-tight">{sub}</div>
      </div>
      <div className="shrink-0">{end}</div>
    </header>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2 text-center">
      <p className="font-mono text-[22px] font-semibold tabular-nums" dir="ltr">
        {value}
      </p>
      <p className="mt-1 text-[12px] text-earth-muted">{label}</p>
    </div>
  );
}

function StateScreen({ icon, title, body, action, onAction }: { icon: 'lock' | 'dumbbell'; title: string; body?: string; action: string; onAction: () => void }) {
  return (
    <div className="flex min-h-[75vh] flex-col items-center justify-center px-4 text-center" data-testid="session-unavailable">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-white/[0.06] text-earth-muted">
        <Icon name={icon} size={26} />
      </span>
      <p className="mt-5 max-w-xs text-[17px] font-semibold">{title}</p>
      {body ? <p className="mt-2 max-w-xs text-[15px] text-earth-muted">{body}</p> : null}
      <Button size="lg" className="mt-6 w-full max-w-xs" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}
