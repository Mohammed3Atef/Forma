import { describe, expect, it } from 'vitest';
import { exerciseTrend, weeklyVolumeTrend } from './calc';
import { weekStartOf } from './utils';
import type { SetLog, WorkoutLog } from '@/types';

function set(overrides: Partial<SetLog> = {}): SetLog {
  return { setIndex: 0, type: 'working', targetReps: '8-12', actualReps: 10, weightKg: 100, rpe: null, done: true, ...overrides };
}

function log(date: string, overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: date,
    date,
    dayId: 'day-1',
    startedAt: null,
    endedAt: null,
    durationSec: 0,
    exercises: [],
    finished: true,
    updatedAt: 0,
    dirty: false,
    ...overrides,
  };
}

describe('exerciseTrend', () => {
  it('returns date + value pairs, oldest first, dropping sessions where the exercise had no valid set', () => {
    const logs: WorkoutLog[] = [
      log('2026-01-01', { exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 100, actualReps: 5 })], done: true }] }),
      log('2026-01-08', { exercises: [{ exerciseId: 'squat', sets: [set({ done: false })], done: false }] }), // no valid set — dropped
      log('2026-01-15', { exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 110, actualReps: 5 })], done: true }] }),
    ];
    const trend = exerciseTrend(logs, 'squat', 8);
    expect(trend.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-15']);
    expect(trend[0].value).toBeGreaterThan(0);
    expect(trend[1].value).toBeGreaterThan(trend[0].value);
  });

  it('ignores unfinished sessions entirely', () => {
    const logs: WorkoutLog[] = [
      log('2026-01-01', { finished: false, exercises: [{ exerciseId: 'squat', sets: [set()], done: true }] }),
    ];
    expect(exerciseTrend(logs, 'squat')).toEqual([]);
  });

  it('keeps only the trailing `limit` sessions, still oldest-first', () => {
    const logs: WorkoutLog[] = Array.from({ length: 10 }, (_, i) =>
      log(`2026-01-${String(i + 1).padStart(2, '0')}`, { exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 100 + i })], done: true }] }),
    );
    const trend = exerciseTrend(logs, 'squat', 3);
    expect(trend.map((p) => p.date)).toEqual(['2026-01-08', '2026-01-09', '2026-01-10']);
  });
});

describe('weeklyVolumeTrend', () => {
  it('buckets finished-log volume into the trailing N weeks, oldest first, current week last', () => {
    const now = new Date(2026, 0, 21); // a Wednesday
    const curWeekStart = weekStartOf(now);
    const oneWeekAgo = new Date(curWeekStart);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const logs: WorkoutLog[] = [
      log(fmt(curWeekStart), { exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 100, actualReps: 10 })], done: true }] }), // current week: 1000kg
      log(fmt(oneWeekAgo), { exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 50, actualReps: 10 })], done: true }] }), // 1 week ago: 500kg
    ];
    const buckets = weeklyVolumeTrend(logs, weekStartOf, now, 8);
    expect(buckets).toHaveLength(8);
    expect(buckets[7].value).toBe(1000); // current week is always the last bucket
    expect(buckets[6].value).toBe(500); // the week before is the second-to-last bucket
    expect(buckets.slice(0, 6).every((b) => b.value === 0)).toBe(true);
    expect(buckets[7].weekStart).toBe(fmt(curWeekStart));
  });

  it('a fully empty log list produces all-zero buckets, not an error', () => {
    const buckets = weeklyVolumeTrend([], weekStartOf, new Date(2026, 0, 21), 8);
    expect(buckets).toHaveLength(8);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });

  it('ignores unfinished sessions', () => {
    const now = new Date(2026, 0, 21);
    const logs: WorkoutLog[] = [
      log(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, {
        finished: false,
        exercises: [{ exerciseId: 'squat', sets: [set({ weightKg: 999 })], done: true }],
      }),
    ];
    const buckets = weeklyVolumeTrend(logs, weekStartOf, now, 8);
    expect(buckets.every((b) => b.value === 0)).toBe(true);
  });
});
