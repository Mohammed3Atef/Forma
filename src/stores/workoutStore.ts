import { create } from 'zustand';
import type {
  Exercise,
  ExerciseLog,
  SetLog,
  WorkoutDay,
  WorkoutLog,
  WorkoutPlan,
} from '@/types';
import { getDataSource } from '@/data/dataSource';
import { debounce, today } from '@/lib/utils';
import { notifyHabitChange } from './habitStore';
import { useDay } from './dayStore';
import { recordDeletion } from '@/data/sync/tombstones';
import { isSubscriptionReadOnly } from './subscriptionGate';

/** Last performed weight×reps for an exercise, for the "previous" ghost column. */
export interface PrevPerf {
  date: string;
  sets: { weightKg: number | null; actualReps: number | null }[];
}

interface WorkoutState {
  plan: WorkoutPlan | null;
  logs: WorkoutLog[];
  active: WorkoutLog | null;
  loaded: boolean;
  /** Last exercise removed from the active session, for one-tap undo. */
  lastRemoved: { log: ExerciseLog; index: number } | null;

  load: () => Promise<void>;
  loadDay: (date: string) => void;
  startSession: (dayId: string) => Promise<void>;
  beginTimer: () => void;
  discardDraft: () => void;
  resumeActive: () => WorkoutLog | null;
  discardActive: () => Promise<void>;
  updateSet: (exerciseId: string, setIndex: number, patch: Partial<SetLog>) => void;
  toggleSetDone: (exerciseId: string, setIndex: number) => void;
  addSet: (exerciseId: string) => void;
  removeSet: (exerciseId: string, setIndex: number) => void;
  addExercise: (exerciseId: string) => void;
  removeExercise: (exerciseId: string) => void;
  undoRemoveExercise: () => void;
  restoreDayExercises: () => void;
  finishSession: (durationOverrideSec?: number) => Promise<WorkoutLog | null>;
  previousFor: (exerciseId: string) => PrevPerf | null;
}

/** Coach-set warm-up count, falling back to the legacy free-text or a default. */
export function warmupCountOf(ex: Pick<Exercise, 'warmupSetCount' | 'warmupSets' | 'workingSets'>): number {
  if (typeof ex.warmupSetCount === 'number' && ex.warmupSetCount >= 0) return ex.warmupSetCount;
  const parsed = parseInt(ex.warmupSets ?? '', 10);
  if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  return ex.workingSets > 0 ? 1 : 0;
}

/** Build the session's sets: `warmupCount` warm-ups, then `workingCount` working sets. */
function buildSets(warmupCount: number, workingCount: number, repRange: string): SetLog[] {
  const sets: SetLog[] = [];
  const push = (type: 'warmup' | 'working') =>
    sets.push({ setIndex: sets.length, type, targetReps: repRange, actualReps: null, weightKg: null, rpe: null, done: false });
  for (let i = 0; i < Math.max(0, warmupCount); i += 1) push('warmup');
  for (let i = 0; i < Math.max(0, workingCount); i += 1) push('working');
  // Safety: never produce an empty exercise.
  if (sets.length === 0) push(workingCount > 0 ? 'working' : 'warmup');
  return sets;
}

/** True when no set in the log has any user-entered data. */
function isEmptyLog(l: WorkoutLog): boolean {
  return l.exercises.every((e) =>
    e.sets.every((s) => s.weightKg == null && s.actualReps == null && !s.done),
  );
}

function buildSession(plan: WorkoutPlan, day: WorkoutDay, date: string): WorkoutLog {
  // Tolerate plan days referencing a removed/unknown exercise (corrupt or
  // partially-synced plan) instead of crashing "Start workout".
  const exercises: ExerciseLog[] = day.exerciseIds.flatMap((exId) => {
    const ex = plan.exercises[exId];
    if (!ex) return [];
    return [{ exerciseId: exId, sets: buildSets(warmupCountOf(ex), ex.workingSets, ex.repRange), done: false }];
  });
  return {
    id: date,
    date,
    dayId: day.id,
    startedAt: null, // not timing yet — the user taps "Start" to begin the timer
    endedAt: null,
    durationSec: 0,
    exercises,
    finished: false,
    updatedAt: Date.now(),
    dirty: true,
  };
}

const persist = debounce((log: WorkoutLog) => {
  void getDataSource().workoutLogs.put(log);
}, 300);

export const useWorkout = create<WorkoutState>((set, get) => ({
  plan: null,
  logs: [],
  active: null,
  loaded: false,
  lastRemoved: null,

  async load() {
    const ds = getDataSource();
    const [plans, logs] = await Promise.all([
      ds.workoutPlans.getAll(),
      ds.workoutLogs.getAll(),
    ]);
    const plan = plans[0] ?? null;
    // Sweep up abandoned drafts from previous days — but ONLY ones with zero
    // entered data, and LOCAL-ONLY (no tombstone), so this can never delete a
    // real or partially-filled workout, here or in the cloud. Today's draft is
    // always kept so a refresh can resume it.
    const td = today();
    const stale = logs.filter((l) => !l.startedAt && !l.finished && l.id !== td && isEmptyLog(l));
    if (stale.length) {
      await Promise.all(stale.map((l) => ds.workoutLogs.remove(l.id)));
    }
    const staleIds = new Set(stale.map((l) => l.id));
    const live = logs.filter((l) => !staleIds.has(l.id));
    const sorted = live.sort((a, b) => b.date.localeCompare(a.date));
    set({ plan, logs: sorted, loaded: true });
    // Focus today's log by default (in-progress → resume, finished → editable).
    get().loadDay(today());
  },

  /** Point `active` at the log for the given calendar day (or null). */
  loadDay(date) {
    const cur = get().active;
    // Never clobber a live in-progress session for the same day (would wipe
    // unsaved reps/weights if this re-runs mid-workout).
    if (cur && cur.id === date && !cur.finished && cur.startedAt) return;
    const log = get().logs.find((l) => l.id === date) ?? null;
    set({ active: log });
  },

  async startSession(dayId) {
    if (isSubscriptionReadOnly()) return; // subscription frozen/ended → workouts are view-only
    const { plan, logs } = get();
    if (!plan) return;
    const day = plan.days.find((d) => d.id === dayId);
    if (!day) return;
    const date = useDay.getState().selected;
    const existing = logs.find((l) => l.id === date);
    // NEVER overwrite a real session for this date. If one is already finished or
    // in progress, open it (resume/edit) — even if it's a different day type — so
    // a saved workout can't be clobbered by starting another on the same date.
    if (existing && (existing.finished || existing.startedAt)) {
      set({ active: existing });
      return;
    }
    // Otherwise reuse an existing empty draft of the same day, or build a fresh
    // one. Persisted right away (local only — drafts never sync) so a page
    // refresh can restore it; the daily load-sweep clears abandoned empty ones.
    const session = existing && existing.dayId === dayId ? existing : buildSession(plan, day, date);
    const others = logs.filter((l) => l.id !== session.id);
    set({ active: session, logs: [session, ...others].sort((a, b) => b.date.localeCompare(a.date)) });
    persist.flush(); // settle any pending debounced write before the direct put
    void getDataSource().workoutLogs.put(session);
  },

  /** Persist the draft + start the timer (first real "record" action). */
  beginTimer() {
    const { active, logs } = get();
    if (!active || active.startedAt || active.finished) return;
    const next = { ...active, startedAt: Date.now(), updatedAt: Date.now(), dirty: true };
    const others = logs.filter((l) => l.id !== next.id);
    set({ active: next, logs: [next, ...others].sort((a, b) => b.date.localeCompare(a.date)) });
    persist.flush(); // settle any pending debounced write before the direct put
    void getDataSource().workoutLogs.put(next);
  },

  resumeActive() {
    return get().active;
  },

  /** Drop an unstarted draft (e.g. user backs out without starting). */
  discardDraft() {
    const { active, logs } = get();
    if (!active || active.startedAt || active.finished) return;
    // A draft with entered data (typed weights/reps) is NOT discarded — that
    // would silently lose the user's input. Persist it and just unfocus.
    if (!isEmptyLog(active)) {
      persist.flush();
      set({ active: null });
      return;
    }
    // Local-only removal — a draft never syncs, so no cloud tombstone (which
    // could otherwise delete real data sharing this date).
    persist.cancel(); // a pending write would resurrect the deleted draft
    void getDataSource().workoutLogs.remove(active.id);
    set({ active: null, logs: logs.filter((l) => l.id !== active.id) });
  },

  async discardActive() {
    const { active } = get();
    if (!active) return;
    persist.cancel(); // a pending write would resurrect the deleted log
    if (active.startedAt || active.finished) {
      await getDataSource().workoutLogs.remove(active.id);
      await recordDeletion('workoutLogs', active.id);
    }
    set({ active: null, logs: get().logs.filter((l) => l.id !== active.id) });
  },

  updateSet(exerciseId, setIndex, patch) {
    const { active } = get();
    if (!active) return;
    const exercises = active.exercises.map((ex) =>
      ex.exerciseId !== exerciseId
        ? ex
        : {
            ...ex,
            sets: ex.sets.map((s) => (s.setIndex === setIndex ? { ...s, ...patch } : s)),
          },
    );
    const next = { ...active, exercises, updatedAt: Date.now(), dirty: true };
    // Keep the logs array in sync so loadDay/previousFor never read stale data.
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)) });
    persist(next); // persisted even before "Start" so a refresh keeps the entry
  },

  toggleSetDone(exerciseId, setIndex) {
    const { active, logs } = get();
    if (!active) return;
    const exercises = active.exercises.map((ex) => {
      if (ex.exerciseId !== exerciseId) return ex;
      const sets = ex.sets.map((s) =>
        s.setIndex === setIndex ? { ...s, done: !s.done } : s,
      );
      return { ...ex, sets, done: sets.every((s) => s.done) };
    });
    let next = { ...active, exercises, updatedAt: Date.now(), dirty: true };
    // Checking off a set is a "record" action — start (and persist) if needed.
    if (!next.startedAt && !next.finished) {
      next = { ...next, startedAt: Date.now() };
      const others = logs.filter((l) => l.id !== next.id);
      set({ active: next, logs: [next, ...others].sort((a, b) => b.date.localeCompare(a.date)) });
    } else {
      // Mirror into logs too, so loadDay/previousFor never read a stale copy.
      set({ active: next, logs: logs.map((l) => (l.id === next.id ? next : l)) });
    }
    persist(next);
  },

  addSet(exerciseId) {
    const { active } = get();
    if (!active) return;
    const exercises = active.exercises.map((ex) => {
      if (ex.exerciseId !== exerciseId) return ex;
      const last = ex.sets[ex.sets.length - 1];
      const newSet: SetLog = {
        setIndex: ex.sets.length,
        type: 'working',
        targetReps: last?.targetReps ?? '',
        actualReps: null,
        weightKg: last?.weightKg ?? null,
        rpe: null,
        done: false,
      };
      return { ...ex, sets: [...ex.sets, newSet], done: false };
    });
    const next = { ...active, exercises, updatedAt: Date.now(), dirty: true };
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)) });
    persist(next);
  },

  removeSet(exerciseId, setIndex) {
    const { active } = get();
    if (!active) return;
    const exercises = active.exercises.map((ex) => {
      if (ex.exerciseId !== exerciseId) return ex;
      // Drop the set and re-number the remaining ones so indices stay contiguous.
      const sets = ex.sets
        .filter((s) => s.setIndex !== setIndex)
        .map((s, i) => ({ ...s, setIndex: i }));
      return { ...ex, sets, done: sets.length > 0 && sets.every((s) => s.done) };
    });
    const next = { ...active, exercises, updatedAt: Date.now(), dirty: true };
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)) });
    persist(next);
  },

  /** Append an exercise (from the plan catalog) to the active session. */
  addExercise(exerciseId) {
    const { active, plan } = get();
    if (!active || !plan) return;
    if (active.exercises.some((e) => e.exerciseId === exerciseId)) return;
    const ex = plan.exercises[exerciseId];
    if (!ex) return;
    const newLog: ExerciseLog = {
      exerciseId,
      sets: buildSets(warmupCountOf(ex), ex.workingSets, ex.repRange),
      done: false,
    };
    const next = { ...active, exercises: [...active.exercises, newLog], updatedAt: Date.now(), dirty: true };
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)) });
    persist(next);
  },

  /** Remove an exercise from the active session (stashed so it can be undone). */
  removeExercise(exerciseId) {
    const { active } = get();
    if (!active) return;
    const index = active.exercises.findIndex((e) => e.exerciseId === exerciseId);
    if (index < 0) return;
    const removed = active.exercises[index];
    const next = {
      ...active,
      exercises: active.exercises.filter((e) => e.exerciseId !== exerciseId),
      updatedAt: Date.now(),
      dirty: true,
    };
    set({
      active: next,
      logs: get().logs.map((l) => (l.id === next.id ? next : l)),
      lastRemoved: { log: removed, index },
    });
    persist(next);
  },

  /** Re-insert the most recently removed exercise at its original position. */
  undoRemoveExercise() {
    const { active, lastRemoved } = get();
    if (!active || !lastRemoved) return;
    const exercises = [...active.exercises];
    exercises.splice(Math.min(lastRemoved.index, exercises.length), 0, lastRemoved.log);
    const next = { ...active, exercises, updatedAt: Date.now(), dirty: true };
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)), lastRemoved: null });
    persist(next);
  },

  /**
   * Re-add every exercise from the day's plan that's missing from the session,
   * restoring the plan's original order. Already-present exercises keep their
   * logged sets; any extra (user-added) exercises are kept at the end.
   */
  restoreDayExercises() {
    const { active, plan } = get();
    if (!active || !plan) return;
    const day = plan.days.find((d) => d.id === active.dayId);
    if (!day) return;
    const present = new Map(active.exercises.map((e) => [e.exerciseId, e]));
    const ordered: ExerciseLog[] = day.exerciseIds.flatMap((id) => {
      const cur = present.get(id);
      if (cur) {
        present.delete(id);
        return [cur];
      }
      const ex = plan.exercises[id];
      if (!ex) return []; // tolerate plans referencing a removed exercise
      return [{ exerciseId: id, sets: buildSets(warmupCountOf(ex), ex.workingSets, ex.repRange), done: false }];
    });
    const extras = active.exercises.filter((e) => present.has(e.exerciseId));
    const next = { ...active, exercises: [...ordered, ...extras], updatedAt: Date.now(), dirty: true };
    set({ active: next, logs: get().logs.map((l) => (l.id === next.id ? next : l)), lastRemoved: null });
    persist(next);
  },

  async finishSession(durationOverrideSec) {
    const { active, logs } = get();
    if (!active) return null;
    const endedAt = Date.now();
    // Prefer an explicit duration (user edited it — e.g. forgot to hit finish).
    // Otherwise time a live session; an already-finished one keeps its value.
    const computed =
      active.startedAt && !active.finished
        ? Math.round((endedAt - active.startedAt) / 1000)
        : active.durationSec;
    const durationSec =
      durationOverrideSec != null && durationOverrideSec > 0
        ? Math.round(durationOverrideSec)
        : computed;
    const finished: WorkoutLog = {
      ...active,
      endedAt: active.endedAt ?? endedAt,
      durationSec,
      finished: true,
      updatedAt: endedAt,
      dirty: true,
    };
    // Drop any pending debounced write: it holds a pre-finish snapshot that
    // would otherwise land AFTER this put and revert the session to unfinished.
    persist.cancel();
    await getDataSource().workoutLogs.put(finished);
    const others = logs.filter((l) => l.id !== finished.id);
    set({
      active: finished,
      logs: [finished, ...others].sort((a, b) => b.date.localeCompare(a.date)),
    });
    notifyHabitChange();
    return finished;
  },

  previousFor(exerciseId) {
    const { logs, active } = get();
    // Most recent finished session BEFORE the day being edited.
    for (const log of logs) {
      if (active && log.id >= active.date) continue;
      if (!log.finished) continue;
      const ex = log.exercises.find((e) => e.exerciseId === exerciseId);
      if (ex && ex.sets.some((s) => s.weightKg != null || s.actualReps != null)) {
        return {
          date: log.date,
          sets: ex.sets.map((s) => ({ weightKg: s.weightKg, actualReps: s.actualReps })),
        };
      }
    }
    return null;
  },
}));
