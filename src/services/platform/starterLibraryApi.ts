import { saveExercise, saveFood, saveFoodGroup, saveWorkoutTemplate } from './coachAssetsApi';
import {
  STARTER_EXERCISES,
  STARTER_FOODS,
  STARTER_FOOD_GROUPS,
  STARTER_TEMPLATES,
} from '@/lib/starterLibrary';
import type { Exercise, FoodGroup, LibraryFood, WorkoutDay, WorkoutTemplate } from '@/types';

export interface SeedResult {
  exercises: number;
  foods: number;
  groups: number;
  templates: number;
}

/** Run `fn` over `items` in bounded-concurrency chunks (avoid 200 parallel writes). */
async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * Seed the comprehensive starter library into `coachAssets/{coachId}`. Uses the
 * deterministic `seed-*` ids in the static data, so re-running OVERWRITES the
 * starter items (no duplicates) and never touches the coach's own additions.
 * Idempotent and safe to offer from any empty state / the onboarding checklist.
 */
export async function seedStarterLibrary(coachId: string): Promise<SeedResult> {
  const now = Date.now();
  const foodById = new Map(STARTER_FOODS.map((f) => [f.id, f]));
  const exById = new Map(STARTER_EXERCISES.map((e) => [e.id, e]));

  await inChunks(STARTER_EXERCISES, 25, (e) => saveExercise(coachId, e));
  await inChunks(STARTER_FOODS, 25, (f) => saveFood(coachId, f));

  await inChunks(STARTER_FOOD_GROUPS, 10, (g) => {
    const foods = g.foodIds.map((id) => foodById.get(id)).filter(Boolean) as LibraryFood[];
    const group: FoodGroup = {
      id: g.id,
      coachId,
      name: g.name,
      foods,
      createdAt: now,
      updatedAt: now,
      ...(g.notes ? { notes: g.notes } : {}),
    };
    return saveFoodGroup(group);
  });

  await inChunks(STARTER_TEMPLATES, 10, (tpl) => {
    const exercises: Record<string, Exercise> = {};
    const days: WorkoutDay[] = tpl.days.map((day, i) => {
      const ids = day.exSlugs.map((s) => `seed-ex-${s}`).filter((id) => exById.has(id));
      for (const id of ids) {
        const e = exById.get(id);
        if (e) exercises[id] = e;
      }
      return { id: `${tpl.id}-day-${i}`, dayIndex: i, title: day.title, focus: day.focus, exerciseIds: ids };
    });
    const template: WorkoutTemplate = {
      id: tpl.id,
      coachId,
      name: tpl.name,
      goal: tpl.goal,
      splitType: tpl.splitType,
      days,
      exercises,
      createdAt: now,
      updatedAt: now,
    };
    return saveWorkoutTemplate(template);
  });

  return {
    exercises: STARTER_EXERCISES.length,
    foods: STARTER_FOODS.length,
    groups: STARTER_FOOD_GROUPS.length,
    templates: STARTER_TEMPLATES.length,
  };
}
