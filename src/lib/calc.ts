/**
 * Strength / volume math shared across Progress, Records, Home and detail screens.
 * All weights are kg (the app is kg-internally; lb display is a future task).
 */
import type { WorkoutLog, SetLog } from '@/types';

/** Epley estimated 1-rep max. */
export function e1rm(kg: number, reps: number): number {
  if (!kg || !reps) return 0;
  return Math.round(kg * (1 + reps / 30));
}

/** Distance covered at a constant speed, rounded to 2 decimals (km). */
export function cardioDistanceKm(speedKmh: number, durationSec: number): number {
  if (speedKmh <= 0 || durationSec <= 0) return 0;
  return Math.round(speedKmh * (durationSec / 3600) * 100) / 100;
}

/**
 * Estimated calories for treadmill-style cardio (ACSM metabolic equations).
 *  Walking (≤ 7.2 km/h): VO2 = 3.5 + 0.1·v + 1.8·v·grade   (v in m/min)
 *  Running (faster):     VO2 = 3.5 + 0.2·v + 0.9·v·grade
 * kcal/min ≈ VO2 (ml/kg/min) · weight (kg) / 1000 · 5 kcal per litre O2.
 * An estimate — the finish popup lets the user correct it before saving.
 */
export function cardioCalories(
  speedKmh: number,
  inclinePct: number,
  weightKg: number,
  durationSec: number,
): number {
  if (speedKmh <= 0 || weightKg <= 0 || durationSec <= 0) return 0;
  const v = (speedKmh * 1000) / 60; // m/min
  const grade = Math.max(0, inclinePct) / 100;
  const vo2 =
    speedKmh <= 7.2 ? 3.5 + 0.1 * v + 1.8 * v * grade : 3.5 + 0.2 * v + 0.9 * v * grade;
  const kcalPerMin = (vo2 * weightKg) / 200;
  return Math.round(kcalPerMin * (durationSec / 60));
}

/** Σ kg*reps over completed sets of a single set list. */
export function setsVolume(sets: SetLog[]): number {
  return sets.reduce(
    (v, s) => (s.done && s.weightKg && s.actualReps ? v + s.weightKg * s.actualReps : v),
    0,
  );
}

/** Total completed-set volume (kg) of a logged workout. */
export function logVolume(log: WorkoutLog): number {
  return log.exercises.reduce((v, ex) => v + setsVolume(ex.sets), 0);
}

/** Count of completed sets in a logged workout. */
export function logSetCount(log: WorkoutLog): number {
  return log.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => s.done).length,
    0,
  );
}

/** Number of exercises that have at least one completed set. */
export function logExerciseCount(log: WorkoutLog): number {
  return log.exercises.filter((ex) => ex.sets.some((s) => s.done)).length;
}

export interface ExercisePR {
  exerciseId: string;
  e1rm: number;
  kg: number;
  reps: number;
  date: string;
}

/** Best estimated 1RM per exercise, derived from finished-session history. */
export function prByExercise(logs: WorkoutLog[]): Map<string, ExercisePR> {
  const best = new Map<string, ExercisePR>();
  for (const log of logs) {
    if (!log.finished) continue;
    for (const ex of log.exercises) {
      for (const s of ex.sets) {
        if (!s.done || !s.weightKg || !s.actualReps) continue;
        const est = e1rm(s.weightKg, s.actualReps);
        const prev = best.get(ex.exerciseId);
        if (!prev || est > prev.e1rm) {
          best.set(ex.exerciseId, {
            exerciseId: ex.exerciseId,
            e1rm: est,
            kg: s.weightKg,
            reps: s.actualReps,
            date: log.date,
          });
        }
      }
    }
  }
  return best;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD, the finished session's date
  value: number;
}

/** Top working-set e1rm trend for one exercise across recent finished sessions, newest last. */
export function exerciseTrend(logs: WorkoutLog[], exerciseId: string, limit = 8): TrendPoint[] {
  return logs
    .filter((l) => l.finished)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const ex = l.exercises.find((e) => e.exerciseId === exerciseId);
      const best = ex
        ? ex.sets.reduce((m, s) => (s.done && s.weightKg && s.actualReps ? Math.max(m, e1rm(s.weightKg, s.actualReps)) : m), 0)
        : 0;
      return { date: l.date, value: best };
    })
    .filter((p) => p.value > 0)
    .slice(-limit);
}

export interface WeeklyVolumeBucket {
  value: number; // total completed-set volume (kg) logged in that week
  weekStart: string; // YYYY-MM-DD, the bucket's week-start day (weekStartOf)
}

/**
 * Total logged volume per week for the trailing `weeks` weeks (default 8),
 * bucketed by the same week-start convention as the rest of the app
 * (`weekStartOf`). Shared by Home's "Volume trend" and Progress's "Weekly
 * volume" charts — previously duplicated independently in both places, which
 * risked the two drifting out of sync. Returns oldest → newest (last bucket
 * = the current week); no i18n/label text — callers own that.
 */
export function weeklyVolumeTrend(logs: WorkoutLog[], weekStartOf: (d: Date) => Date, now = new Date(), weeks = 8): WeeklyVolumeBucket[] {
  const parseDay = (key: string): Date => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const curMon = weekStartOf(now).getTime();
  const buckets = Array.from({ length: weeks }, () => 0);
  logs
    .filter((l) => l.finished)
    .forEach((l) => {
      const wkMon = weekStartOf(parseDay(l.date)).getTime();
      const idx = weeks - 1 - Math.round((curMon - wkMon) / (7 * 86_400_000));
      if (idx >= 0 && idx < weeks) buckets[idx] += logVolume(l);
    });
  return buckets.map((value, i) => {
    const d = new Date(curMon);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return { value, weekStart: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
  });
}
