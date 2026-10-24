import { describe, expect, it } from 'vitest';
import {
  addDay,
  addExercises,
  addSection,
  duplicateDay,
  duplicateExercise,
  isPlainDay,
  knownKind,
  moveDay,
  moveExercise,
  moveExerciseToSection,
  normalizeWorkoutBody,
  patchSection,
  removeDay,
  removeExercise,
  removeSection,
  serializeWorkoutBody,
  type PlanBody,
} from './workoutPlanModel';
import type { Exercise, WorkoutDay } from '@/types';

const ex = (id: string, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  targetMuscle: '',
  warmupSets: '0',
  workingSets: 3,
  repRange: '8-12',
  rir: '2',
  tempo: '3-0-1',
  notes: { en: 'n', ar: 'ن' },
  restSec: 90,
  videoId: null,
  ...extra,
});
const flat = (id: string, ids: string[], extra: Partial<WorkoutDay> = {}): WorkoutDay => ({ id, dayIndex: 0, title: id, focus: '', exerciseIds: ids, ...extra });
const body = (days: WorkoutDay[], exIds: string[]): PlanBody => ({ days, exercises: Object.fromEntries(exIds.map((i) => [i, ex(i)])) });
const invariant = (p: PlanBody) => p.days.every((d) => JSON.stringify(d.exerciseIds) === JSON.stringify((d.sections ?? []).flatMap((s) => s.exerciseIds)));

describe('B34-R1: an older plan opens unchanged and saves in its own shape', () => {
  it('flat days (no `sections` key) and `sections: []` days get an implicit section and round-trip exactly', () => {
    const stored = body([flat('d1', ['a', 'b']), flat('d2', [], { sections: [] }), flat('d3', ['c'], { sections: [] })], ['a', 'b', 'c']);
    const working = normalizeWorkoutBody(stored);
    expect(working.days.map((d) => d.sections?.length)).toEqual([1, 1, 1]);
    expect(working.days.every(isPlainDay)).toBe(true);
    expect(working.days[0].sections?.[0]).toMatchObject({ title: '', kind: 'normal', exerciseIds: ['a', 'b'] });
    expect(serializeWorkoutBody(working)).toEqual(stored); // byte-for-byte the same data
    // Deterministic: opening twice gives the same working copy (a draft or baseline never differs by a random id).
    expect(normalizeWorkoutBody(stored)).toEqual(working);
  });

  it('sectioned days pass through untouched (same object), as do unknown stored kinds', () => {
    const d: WorkoutDay = { ...flat('d1', ['a']), sections: [{ id: 's1', title: 'Main', kind: 'main' as never, exerciseIds: ['a'] }] };
    const stored = body([d], ['a']);
    expect(normalizeWorkoutBody(stored)).toBe(stored);
    expect(serializeWorkoutBody(stored).days[0]).toBe(d);
    expect(knownKind('main')).toBe('normal');
    expect(knownKind('warmup')).toBe('warmup');
  });

  it('an exercise added to an older flat day stays flat when saved; a named section makes it sectioned', () => {
    const working = normalizeWorkoutBody(body([flat('d1', ['a'])], ['a']));
    const secId = working.days[0].sections![0].id;
    const added = addExercises(working, 'd1', secId, [ex('b')]);
    expect(invariant(added)).toBe(true);
    expect(serializeWorkoutBody(added).days[0]).toEqual({ id: 'd1', dayIndex: 0, title: 'd1', focus: '', exerciseIds: ['a', 'b'] });
    const named = patchSection(added, 'd1', secId, { title: 'Main' });
    expect(serializeWorkoutBody(named).days[0].sections).toEqual([{ id: secId, title: 'Main', kind: 'normal', exerciseIds: ['a', 'b'] }]);
  });
});

describe('structural edits keep exerciseIds = sections flattened and ids stable', () => {
  const start = () => normalizeWorkoutBody(body([flat('d1', ['a', 'b']), flat('d2', ['c'])], ['a', 'b', 'c']));

  it('a new day is plain and stored flat', () => {
    const { body: b, dayId } = addDay(start(), 'Day 3');
    const day = b.days.find((d) => d.id === dayId)!;
    expect(day.dayIndex).toBe(2);
    expect(isPlainDay(day)).toBe(true);
    expect(serializeWorkoutBody(b).days[2]).toEqual({ id: dayId, dayIndex: 2, title: 'Day 3', focus: '', exerciseIds: [] });
  });

  it('a named section on an empty plain day replaces the implicit one; with exercises it is added after', () => {
    const { body: b1, dayId } = addDay(start(), 'Day 3');
    const { body: b2, sectionId } = addSection(b1, dayId, 'warmup');
    expect(b2.days[2].sections).toEqual([{ id: sectionId, title: '', kind: 'warmup', exerciseIds: [] }]);
    const { body: b3 } = addSection(start(), 'd1');
    expect(b3.days[0].sections?.map((s) => s.exerciseIds)).toEqual([['a', 'b'], []]);
    expect(isPlainDay(b3.days[0])).toBe(false);
  });

  it('moving an exercise walks through the day, crossing into the neighbouring section', () => {
    const { body: b1, sectionId } = addSection(start(), 'd1');
    let b = moveExercise(b1, 'd1', 'b', 1); // last of section 1 → first of section 2
    expect(b.days[0].sections?.map((s) => s.exerciseIds)).toEqual([['a'], ['b']]);
    expect(b.days[0].exerciseIds).toEqual(['a', 'b']);
    b = moveExercise(b, 'd1', 'b', -1); // back up to the end of section 1
    expect(b.days[0].sections?.map((s) => s.exerciseIds)).toEqual([['a', 'b'], []]);
    b = moveExercise(b, 'd1', 'a', -1); // already first — unchanged
    expect(b.days[0].sections?.[0].exerciseIds).toEqual(['a', 'b']);
    b = moveExerciseToSection(b, 'd1', 'a', sectionId);
    expect(b.days[0].sections?.map((s) => s.exerciseIds)).toEqual([['b'], ['a']]);
    expect(invariant(b)).toBe(true);
  });

  it('remove / duplicate exercise, remove section (with its exercises), remove / move / duplicate day', () => {
    let b = duplicateExercise(start(), 'd1', 'a');
    const copyId = b.days[0].exerciseIds[1];
    expect(copyId).not.toBe('a');
    expect(b.exercises[copyId]).toMatchObject({ name: 'a', rir: '2', tempo: '3-0-1', notes: { en: 'n', ar: 'ن' } });
    b = removeExercise(b, 'd1', copyId);
    expect(b.days[0].exerciseIds).toEqual(['a', 'b']);
    expect(b.exercises[copyId]).toBeUndefined();

    const sec = b.days[0].sections![0].id;
    b = removeSection(b, 'd1', sec);
    expect(b.days[0].exerciseIds).toEqual([]);
    expect(isPlainDay(b.days[0])).toBe(true); // an empty plain day is left, never a day without sections
    expect(b.exercises.a).toBeUndefined();

    const dup = duplicateDay(b, 'd2', 'd2 (copy)');
    expect(dup.body.days.map((d) => d.title)).toEqual(['d1', 'd2', 'd2 (copy)']);
    expect(dup.body.days[2].exerciseIds[0]).not.toBe('c');
    expect(isPlainDay(dup.body.days[2])).toBe(true);
    expect(dup.body.days.map((d) => d.dayIndex)).toEqual([0, 1, 2]);

    const moved = moveDay(dup.body, dup.dayId, -1);
    expect(moved.days.map((d) => [d.title, d.dayIndex])).toEqual([['d1', 0], ['d2 (copy)', 1], ['d2', 2]]);
    const removed = removeDay(moved, 'd2');
    expect(removed.days.map((d) => d.dayIndex)).toEqual([0, 1]);
    expect(removed.exercises.c).toBeUndefined();
    expect(invariant(removed)).toBe(true);
  });
});

describe('malformed stored data never breaks the editor', () => {
  it('a section without its list reads as empty; a plan without days / exercises reads as empty', () => {
    const d = { id: 'd1', dayIndex: 0, title: 'x', focus: '', exerciseIds: ['a'], sections: [{ id: 's', title: 'Main', kind: 'normal' }] } as unknown as WorkoutDay;
    const n = normalizeWorkoutBody(body([d], ['a']));
    expect(n.days[0].sections?.[0].exerciseIds).toEqual([]);
    const empty = normalizeWorkoutBody({ id: 'p' } as unknown as PlanBody);
    expect(empty).toMatchObject({ days: [], exercises: {} });
  });
});

