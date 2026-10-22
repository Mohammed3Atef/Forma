import { describe, expect, it } from 'vitest';
import { legacyViewTarget, progressViewOf, samePlaceFor, sectionOf, sectionPath, trainingStats, weekRows, versionsTarget, weekTraining, weightTrend } from './coachWorkspace';
import type { CardioLog, MealPlan, NutritionLog, WeightLog, WorkoutLog, WorkoutPlan } from '@/types';

const wl = (date: string, over: Partial<WorkoutLog> = {}): WorkoutLog =>
  ({ id: date, date, dayId: 'd1', startedAt: 1, endedAt: 2, durationSec: 3600, exercises: [], finished: true, updatedAt: 0, dirty: false, ...over }) as WorkoutLog;
const plan = (days: string[]): WorkoutPlan => ({ id: 'p', name: 'Upper / lower', days: days.map((id) => ({ id, title: id.toUpperCase(), exerciseIds: [] })), exercises: {}, updatedAt: 0 }) as unknown as WorkoutPlan;
const ww = (date: string, kg: number): WeightLog => ({ id: date, date, weightKg: kg, updatedAt: 0, dirty: false });

describe('workspace routes (B3.4)', () => {
  it('every workspace URL belongs to one section; editors draw no workspace chrome', () => {
    const c = 'c1';
    expect(sectionOf('/coach/client/c1', c)).toBe('summary');
    expect(sectionOf('/coach/client/c1/', c)).toBe('summary');
    expect(sectionOf('/coach/client/c1/plan', c)).toBe('plan');
    expect(sectionOf('/coach/client/c1/versions/workout', c)).toBe('plan');
    // B3.9 (D10): the old version-history URL opens the editor's History sheet.
    expect(versionsTarget('c1', 'workout')).toBe('/coach/client/c1/workout?history=1');
    expect(versionsTarget('c1', 'nutrition')).toBe('/coach/client/c1/nutrition?history=1');
    expect(versionsTarget('c1', 'cardio')).toBe('/coach/client/c1/cardio?history=1');
    expect(versionsTarget('c1', 'bogus')).toBe('/coach/client/c1/plan');
    for (const e of ['workout', 'nutrition', 'cardio']) expect(sectionOf(`/coach/client/c1/${e}`, c)).toBe('editor');
    for (const p of ['progress', 'checkins', 'view', 'view/photos']) expect(sectionOf(`/coach/client/c1/${p}`, c)).toBe('progress');
    for (const p of ['profile', 'assessment', 'notes', 'subscription', 'history']) expect(sectionOf(`/coach/client/c1/${p}`, c)).toBe('profile');
  });

  it('section paths; switching client keeps the place (an editor lands on the other client\'s Plan)', () => {
    expect(sectionPath('c1', 'summary')).toBe('/coach/client/c1');
    expect(sectionPath('c1', 'progress')).toBe('/coach/client/c1/progress');
    expect(samePlaceFor('/coach/client/c1/progress', 'c1', 'c2', '?view=body')).toBe('/coach/client/c2/progress?view=body');
    expect(samePlaceFor('/coach/client/c1/subscription', 'c1', 'c2')).toBe('/coach/client/c2/subscription');
    expect(samePlaceFor('/coach/client/c1', 'c1', 'c2')).toBe('/coach/client/c2');
    expect(samePlaceFor('/coach/client/c1/workout', 'c1', 'c2')).toBe('/coach/client/c2/plan');
  });

  it('the retired "view as client" tabs land on the matching Progress view; unknown views read as Week', () => {
    expect(legacyViewTarget('c1', undefined)).toBe('/coach/client/c1/progress?view=day');
    expect(legacyViewTarget('c1', 'activity')).toBe('/coach/client/c1/progress?view=day');
    expect(legacyViewTarget('c1', 'measurements')).toBe('/coach/client/c1/progress?view=body');
    expect(legacyViewTarget('c1', 'progress')).toBe('/coach/client/c1/progress?view=body');
    expect(legacyViewTarget('c1', 'photos')).toBe('/coach/client/c1/progress?view=photos');
    expect(legacyViewTarget('c1', 'nope')).toBe('/coach/client/c1/progress?view=day');
    expect(progressViewOf('body')).toBe('body');
    expect(progressViewOf('day')).toBe('day');
    expect(progressViewOf('bogus')).toBe('week');
    expect(progressViewOf(null)).toBe('week');
  });
});

describe('Summary numbers come from the logs, each with its window', () => {
  const today = '2026-10-21'; // Wednesday; the training week starts Saturday 2026-10-17
  const week = '2026-10-17';

  it('this week counts distinct plan days finished since Saturday (the client app\'s rule); 7 / 28 days count every finished workout', () => {
    const logs = [
      wl('2026-10-21', { dayId: 'a' }),
      wl('2026-10-19', { dayId: 'b' }),
      wl('2026-10-18', { dayId: 'a' }), // the same plan day twice this week counts once
      wl('2026-10-16', { dayId: 'a' }), // last week
      wl('2026-10-10', { dayId: 'b' }),
      wl('2026-09-24', { dayId: 'a' }), // 27 days ago
      wl('2026-09-23', { dayId: 'a' }), // 28 days ago — outside
      wl('2026-10-20', { dayId: 'c', finished: false }), // in progress — not a workout yet
    ];
    const s = trainingStats(logs, plan(['a', 'b', 'c']), today, week);
    expect(s).toEqual({ doneThisWeek: 2, sessionsThisWeek: 3, planDays: 3, last7: 4, last28: 6, lastWorkout: '2026-10-21' });
  });

  it('no plan → no "of planned"; no logs → zeros and no last workout (never a guess)', () => {
    expect(trainingStats([wl('2026-10-20', { dayId: 'x' })], null, today, week)).toMatchObject({ doneThisWeek: 1, planDays: null, last7: 1 });
    expect(trainingStats([], plan(['a']), today, week)).toEqual({ doneThisWeek: 0, sessionsThisWeek: 0, planDays: 1, last7: 0, last28: 0, lastWorkout: null });
  });

  it('B3.9 — one weekly rule: distinct plan days done ÷ plan days, never more done than planned; sessions beside it', () => {
    // Four sessions on a 3-day plan: day a twice, day b, and a workout that isn't a plan day.
    const logs = [wl('2026-10-17', { dayId: 'a' }), wl('2026-10-18', { dayId: 'b' }), wl('2026-10-19', { dayId: 'a' }), wl('2026-10-20', { dayId: 'extra' })];
    expect(weekTraining(logs, plan(['a', 'b', 'c']), week, today)).toEqual({ done: 2, planned: 3, sessions: 4 });
    // A past week is bounded by its own last day.
    expect(weekTraining(logs, plan(['a', 'b', 'c']), week, '2026-10-18')).toEqual({ done: 2, planned: 3, sessions: 2 });
    // No plan (or an empty one) has no denominator.
    expect(weekTraining(logs, null, week, today)).toEqual({ done: 3, planned: null, sessions: 4 });
    expect(weekTraining(logs, plan([]), week, today).planned).toBeNull();
    // Unfinished workouts never count.
    expect(weekTraining([wl('2026-10-20', { dayId: 'a', finished: false })], plan(['a']), week, today)).toEqual({ done: 0, planned: 1, sessions: 0 });
  });

  it('weight: the latest weigh-in, and the change from the earliest weigh-in within 28 days', () => {
    expect(weightTrend([], today)).toEqual({ latest: null, change: null });
    expect(weightTrend([ww('2026-10-20', 80)], today)).toEqual({ latest: { date: '2026-10-20', kg: 80 }, change: null });
    const t = weightTrend([ww('2026-09-01', 90), ww('2026-09-30', 84.2), ww('2026-10-10', 83.4), ww('2026-10-20', 82.9)], today);
    expect(t.latest).toEqual({ date: '2026-10-20', kg: 82.9 });
    expect(t.change).toEqual({ from: '2026-09-30', kg: -1.3 });
  });
});

describe('Progress › Week rows', () => {
  const today = '2026-10-21';
  const meal = { meals: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] } as unknown as MealPlan;
  const nl = (date: string, eaten: string[]): NutritionLog => ({ id: date, date, mealsEaten: Object.fromEntries(eaten.map((m) => [m, true])), supplementsTaken: {}, customFoods: [], itemOverrides: {} }) as unknown as NutritionLog;
  const cl = (date: string, min: number): CardioLog => ({ id: `${date}-${min}`, date, type: 'walk', durationSec: min * 60, distanceKm: null, caloriesBurned: null, steps: null, updatedAt: 0, dirty: false }) as unknown as CardioLog;

  it('Saturday → today, one row per day: workout (with the plan day\'s name), meals eaten of planned, cardio minutes', () => {
    const rows = weekRows(
      '2026-10-17',
      today,
      { workouts: [wl('2026-10-18', { dayId: 'a' }), wl('2026-10-20', { dayId: 'b', finished: false, startedAt: 5 })], nutrition: [nl('2026-10-18', ['m1', 'm2'])], cardio: [cl('2026-10-18', 20), cl('2026-10-18', 15)] },
      { workout: plan(['a', 'b']), meal },
      '2026-08-27',
    );
    expect(rows.map((r) => r.date)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
    expect(rows[1]).toEqual({ date: '2026-10-18', workout: 'done', workoutTitle: 'A', mealsEaten: 2, mealsPlanned: 3, cardioMin: 35, known: true });
    expect(rows[3]).toMatchObject({ workout: 'started', workoutTitle: 'B' });
    expect(rows[0]).toMatchObject({ workout: null, mealsEaten: 0, cardioMin: 0, known: true });
  });

  it('days older than the logs read are unknown, not "nothing logged"', () => {
    const rows = weekRows('2026-08-22', today, { workouts: [], nutrition: [], cardio: [] }, {}, '2026-08-27');
    expect(rows.map((r) => r.known)).toEqual([false, false, false, false, false, true, true]);
    expect(rows[0].mealsPlanned).toBeNull();
  });
});
