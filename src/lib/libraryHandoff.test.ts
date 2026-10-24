import { describe, expect, it } from 'vitest';
import { addLibraryExercise, addLibraryFood, exerciseTargets, foodFromLibrary, mealTargets, useInPlanPath } from './libraryHandoff';
import { normalizeWorkoutBody, serializeWorkoutBody } from './workoutPlanModel';
import { pickFromLibrary } from './workoutPresets';
import { withSyncResult } from '../data/librarySyncIssues';
import type { Exercise, LibraryFood, MealPlan, WorkoutPlan } from '@/types';

/**
 * Journey I (blueprint §10.2): search → use in a plan → no duplicated or corrupted metadata,
 * bilingual intact. The hand-off adds exactly the copy the editors' own pickers make, and only to
 * the working plan (the editor saves it).
 */
const libEx: Exercise = {
  id: 'lib-bench',
  name: 'Bench press',
  targetMuscle: 'Chest',
  category: 'Push',
  equipment: 'Barbell',
  warmupSets: '1',
  warmupSetCount: 1,
  workingSets: 4,
  repRange: '6-8',
  rir: '2',
  tempo: '2-0-1',
  notes: { en: 'Pause on the chest', ar: 'توقف على الصدر' },
  restSec: 150,
  videoId: null,
  videoUrl: 'https://cdn.test/bench.mp4',
  images: ['https://cdn.test/bench.png'],
  tags: ['strength'],
  sourceProvider: 'wger',
  sourceId: '73',
};

const plan = (): WorkoutPlan =>
  normalizeWorkoutBody({
    id: 'wp1',
    name: 'Base',
    updatedAt: 10,
    meta: { sourceTemplateId: 't', sourceTemplateName: 'T', assignedAt: 1, assignedBy: 'c', isCustomized: false },
    days: [
      { id: 'd-flat', dayIndex: 0, title: 'Upper', focus: '', exerciseIds: ['x1'] },
      { id: 'd-sec', dayIndex: 1, title: 'Lower', focus: '', exerciseIds: ['x2'], sections: [{ id: 's-warm', title: 'Warm-up', kind: 'warmup', exerciseIds: ['x2'] }, { id: 's-main', title: '', kind: 'working', exerciseIds: [] }] },
    ],
    exercises: { x1: { ...libEx, id: 'x1', name: 'Row' }, x2: { ...libEx, id: 'x2', name: 'Bike' } },
  } as WorkoutPlan);

describe('Use in a client plan — training', () => {
  it('lists plain days once and sectioned days per section', () => {
    expect(exerciseTargets(plan()).map((t) => [t.dayId, t.sectionId, t.sectionTitle, t.count])).toEqual([
      ['d-flat', 'd-flat~none', null, 1],
      ['d-sec', 's-warm', 'Warm-up', 1],
      ['d-sec', 's-main', '', 0],
    ]);
  });

  it('adds one library-linked copy: a new id, every field and both languages kept, exerciseIds in step; the input is untouched', () => {
    const before = plan();
    const snapshot = JSON.stringify(before);
    const res = addLibraryExercise(before, { dayId: 'd-flat', sectionId: 'd-flat~none' }, libEx);
    expect(JSON.stringify(before)).toBe(snapshot);
    const added = res.body.exercises[res.exerciseId];
    expect(res.exerciseId).not.toBe(libEx.id);
    const { id: _a, libraryExerciseId, librarySyncEnabled, ...rest } = added;
    const { id: _b, ...lib } = libEx;
    expect(rest).toEqual(lib);
    expect(rest.notes).toEqual({ en: 'Pause on the chest', ar: 'توقف على الصدر' });
    expect([libraryExerciseId, librarySyncEnabled]).toEqual(['lib-bench', true]);
    // Exactly what the picker adds (pickFromLibrary), apart from the generated id.
    const picked = pickFromLibrary(libEx);
    expect({ ...added, id: picked.id }).toEqual(picked);
    const day = res.body.days.find((d) => d.id === 'd-flat')!;
    expect(day.exerciseIds).toEqual(['x1', res.exerciseId]);
    expect(Object.keys(res.body.exercises)).toHaveLength(3); // nothing duplicated
    // The stored shape of an untouched flat day stays flat.
    const stored = serializeWorkoutBody(res.body as WorkoutPlan);
    expect(stored.days[0].sections).toBeUndefined();
    expect(stored.days[0].exerciseIds).toEqual(['x1', res.exerciseId]);
    expect((res.body as WorkoutPlan).meta).toEqual(before.meta); // the rest of the plan rides along
  });

  it('into a named section, or a new day at the end', () => {
    const into = addLibraryExercise(plan(), { dayId: 'd-sec', sectionId: 's-main' }, libEx);
    const sec = into.body.days[1].sections!.find((s) => s.id === 's-main')!;
    expect(sec.exerciseIds).toEqual([into.exerciseId]);
    expect(into.body.days[1].exerciseIds).toEqual(['x2', into.exerciseId]);
    const fresh = addLibraryExercise(plan(), { newDayTitle: 'Day 3' }, libEx);
    expect(fresh.body.days).toHaveLength(3);
    expect(fresh.body.days[2]).toMatchObject({ id: fresh.dayId, title: 'Day 3', dayIndex: 2, exerciseIds: [fresh.exerciseId] });
  });

  it('the editor URL carries the hand-off (encoded)', () => {
    expect(useInPlanPath('exercise', 'c 1', 'wger-9')).toBe('/coach/client/c%201/workout?addExercise=wger-9');
    expect(useInPlanPath('food', 'c1', 'f/1')).toBe('/coach/client/c1/nutrition?addFood=f%2F1');
  });
});

describe('Use in a client plan — nutrition', () => {
  const food: LibraryFood = { id: 'lib-oats', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6, category: 'Carbs', tags: ['breakfast'] };
  const meals = (): MealPlan => ({
    id: 'np',
    name: 'Cut',
    meals: [{ id: 'm1', slot: 'breakfast', label: { en: 'Breakfast', ar: 'الفطور' }, items: [{ id: 'i1', name: { en: 'Eggs', ar: 'بيض' }, quantity: '3', calories: 210, protein: 18, carbs: 1, fats: 15 }] }],
    targets: { calories: 2000, protein: 150, carbs: 200, fats: 60 },
    supplements: [],
    waterTargetMl: 3000,
    beverageNotes: [],
    generalNotes: [],
    updatedAt: 5,
  });
  let n = 0;
  const id = () => `new${++n}`;

  it('the item is what the food sheet makes from a library pick: both languages, serving and macros — no library-only fields', () => {
    expect(foodFromLibrary(food, () => 'x')).toEqual({ id: 'x', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6 });
  });

  it('adds to the end of a meal, or as a new meal; other meals and the input stay as they were', () => {
    expect(mealTargets(meals())).toEqual([{ mealId: 'm1', label: { en: 'Breakfast', ar: 'الفطور' }, count: 1 }]);
    const before = meals();
    const snap = JSON.stringify(before);
    const res = addLibraryFood(before, { mealId: 'm1' }, food, id);
    expect(JSON.stringify(before)).toBe(snap);
    expect(res.plan.meals[0].items.map((i) => i.id)).toEqual(['i1', res.itemId]);
    expect(res.plan.targets).toBe(before.targets);
    const fresh = addLibraryFood(before, { newMeal: { id: 'm2', slot: 'breakfast', label: { en: 'Meal 2', ar: '' } } }, food, id);
    expect(fresh.plan.meals).toHaveLength(2);
    expect(fresh.plan.meals[1]).toMatchObject({ id: 'm2', items: [{ id: fresh.itemId, name: { en: 'Oats', ar: 'شوفان' } }] });
  });
});

describe('template sync notices (TS-04)', () => {
  it('a failure is recorded once per exercise and a later success clears it', () => {
    let issues = withSyncResult([], 'e1', 'Bench', true, 1);
    issues = withSyncResult(issues, 'e1', 'Bench press', true, 2);
    issues = withSyncResult(issues, 'e2', 'Squat', true, 3);
    expect(issues).toEqual([
      { exerciseId: 'e1', name: 'Bench press', at: 2 },
      { exerciseId: 'e2', name: 'Squat', at: 3 },
    ]);
    expect(withSyncResult(issues, 'e1', 'Bench press', false)).toEqual([{ exerciseId: 'e2', name: 'Squat', at: 3 }]);
  });
});
