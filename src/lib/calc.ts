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

/** Top working-set e1rm trend for one exercise across recent finished sessions. */
export function exerciseTrend(logs: WorkoutLog[], exerciseId: string, limit = 8): number[] {
  return logs
    .filter((l) => l.finished)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => {
      const ex = l.exercises.find((e) => e.exerciseId === exerciseId);
      if (!ex) return 0;
      return ex.sets.reduce(
        (best, s) => (s.done && s.weightKg && s.actualReps ? Math.max(best, e1rm(s.weightKg, s.actualReps)) : best),
        0,
      );
    })
    .filter((v) => v > 0)
    .slice(-limit);
}
