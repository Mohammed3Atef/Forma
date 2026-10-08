import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data/dataSource', () => {
  const repo = () => {
    const m = new Map<string, unknown>();
    return { get: async (id: string) => m.get(id) ?? null, getAll: async () => [...m.values()], put: async (v: { id: string }) => (m.set(v.id, v), v), remove: async (id: string) => void m.delete(id) };
  };
  const ds = { workoutLogs: repo(), workoutPlans: repo() };
  return { getDataSource: () => ds, cloudAvailable: () => true };
});
vi.mock('./subscriptionGate', () => ({ isSubscriptionReadOnly: () => false }));

import { useWorkout } from './workoutStore';
import { useDay } from './dayStore';
import { clientNoteRoute, openClientNote } from '@/lib/noteTarget';
import { today, addDays } from '@/lib/utils';
import type { SetLog, WorkoutLog, WorkoutPlan } from '@/types';

const set = (setIndex: number, over: Partial<SetLog> = {}): SetLog => ({ setIndex, type: 'working', targetReps: '8-12', actualReps: null, weightKg: null, rpe: null, done: false, ...over });
const plan: WorkoutPlan = {
  id: 'p',
  name: 'Plan',
  days: [{ id: 'd1', name: 'Push', exerciseIds: ['bench'] }],
  exercises: { bench: { id: 'bench', name: 'Bench', targetMuscle: 'chest', workingSets: 2, repRange: '8-12', restSec: 90 } },
  updatedAt: 1,
} as unknown as WorkoutPlan;

function session(sets: SetLog[], date = today()): WorkoutLog {
  return { id: date, date, dayId: 'd1', startedAt: 1, endedAt: null, durationSec: 0, exercises: [{ exerciseId: 'bench', sets, done: false }], finished: false, updatedAt: 1, dirty: true } as WorkoutLog;
}
const yesterday = addDays(today(), -1);
const lastTime: WorkoutLog = { ...session([set(0, { weightKg: 52.5, actualReps: 10, done: true }), set(1, { weightKg: 50, actualReps: 9, done: true })], yesterday), finished: true };

beforeEach(() => {
  useDay.setState({ selected: today() });
});

describe('a ticked set always records numbers (CL-17 / JR-01)', () => {
  it("✓ on an empty row commits last session's values shown as placeholders", () => {
    const cur = session([set(0), set(1)]);
    useWorkout.setState({ plan, logs: [cur, lastTime], active: cur });
    expect(useWorkout.getState().toggleSetDone('bench', 0)).toBe(true);
    expect(useWorkout.getState().active!.exercises[0].sets[0]).toMatchObject({ done: true, weightKg: 52.5, actualReps: 10 });
  });

  it('typed values win over the placeholders; a typed 0 kg (bodyweight) is kept', () => {
    const cur = session([set(0, { weightKg: 0, actualReps: 15 }), set(1)]);
    useWorkout.setState({ plan, logs: [cur, lastTime], active: cur });
    useWorkout.getState().toggleSetDone('bench', 0);
    expect(useWorkout.getState().active!.exercises[0].sets[0]).toMatchObject({ done: true, weightKg: 0, actualReps: 15 });
  });

  it('with no history and a range target, an empty row cannot be ticked', () => {
    const cur = session([set(0), set(1)]);
    useWorkout.setState({ plan, logs: [cur], active: cur });
    expect(useWorkout.getState().toggleSetDone('bench', 0)).toBe(false);
    expect(useWorkout.getState().active!.exercises[0].sets[0].done).toBe(false);
  });

  it('a plain-number target is what the row shows, so it is committed', () => {
    const cur = session([set(0, { targetReps: '8' })]);
    useWorkout.setState({ plan, logs: [cur], active: cur });
    expect(useWorkout.getState().toggleSetDone('bench', 0)).toBe(true);
    expect(useWorkout.getState().active!.exercises[0].sets[0]).toMatchObject({ done: true, actualReps: 8, weightKg: null });
  });

  it('unticking keeps the numbers', () => {
    const cur = session([set(0, { weightKg: 60, actualReps: 8, done: true })]);
    useWorkout.setState({ plan, logs: [cur], active: cur });
    expect(useWorkout.getState().toggleSetDone('bench', 0)).toBe(true);
    expect(useWorkout.getState().active!.exercises[0].sets[0]).toMatchObject({ done: false, weightKg: 60, actualReps: 8 });
  });
});

describe('logging date (CL-04 / NT-02)', () => {
  it('a new session is created on today even when a past day is selected', async () => {
    useWorkout.setState({ plan, logs: [], active: null });
    useDay.setState({ selected: addDays(today(), -9) });
    await useWorkout.getState().startSession('d1');
    expect(useWorkout.getState().active?.id).toBe(today());
  });

  it('resolving a dated note route has no side effects; only opening it moves the day', () => {
    const note = { screen: 'nutrition' as const, date: '2026-09-25', entityType: 'meal' as const, entityId: 'm1' };
    expect(clientNoteRoute(note)).toBe('/nutrition');
    expect(useDay.getState().selected).toBe(today());
    expect(openClientNote(note)).toBe('/nutrition');
    expect(useDay.getState().selected).toBe('2026-09-25');
  });
});
