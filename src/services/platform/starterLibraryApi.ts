import { saveExercise, saveFood, saveFoodGroup, saveWorkoutTemplate } from './coachAssetsApi';
import {
  STARTER_FOODS,
  STARTER_FOOD_GROUPS,
  STARTER_TEMPLATES,
  type StarterTemplate,
} from '@/lib/starterLibrary';
import type { Exercise, FoodGroup, LibraryFood, WorkoutDay, WorkoutTemplate } from '@/types';

export interface SeedResult {
  exercises: number;
  foods: number;
  groups: number;
  templates: number;
}

/**
 * The shared starter EXERCISE dataset (free-exercise-db, public domain) at
 * `public/data/exercise-library.json`. Fetched at runtime so the ~150 KB of
 * exercise data never bloats the JS bundle. This is the single source of truth
 * for starter exercises — both "Load starter library" and the coach library's
 * one-tap import read it.
 */
export async function fetchStarterExercises(): Promise<Exercise[]> {
  const res = await fetch('/data/exercise-library.json');
  if (!res.ok) throw new Error('Failed to load exercise library');
  return (await res.json()) as Exercise[];
}

/** Run `fn` over `items` in bounded-concurrency chunks (avoid 200 parallel writes). */
async function inChunks<T>(items: T[], size: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

const LEVEL_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, expert: 2 };

/** Group exercises by `targetMuscle`, ordered beginner-first then by name (stable picks). */
function groupByMuscle(exercises: Exercise[]): Map<string, Exercise[]> {
  const m = new Map<string, Exercise[]>();
  for (const e of exercises) {
    const key = e.targetMuscle || e.category || 'Other';
    const arr = m.get(key);
    if (arr) arr.push(e);
    else m.set(key, [e]);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const la = LEVEL_ORDER[(a as { level?: string }).level ?? ''] ?? 1;
      const lb = LEVEL_ORDER[(b as { level?: string }).level ?? ''] ?? 1;
      return la - lb || a.name.localeCompare(b.name);
    });
  }
  return m;
}

/** Fill a day by drawing up to `count` exercises round-robin across `muscles`, skipping `used`. */
function pickByMuscles(byMuscle: Map<string, Exercise[]>, muscles: string[], count: number, used: Set<string>): Exercise[] {
  const picks: Exercise[] = [];
  const cursor = new Map<string, number>(muscles.map((mu) => [mu, 0]));
  let progressed = true;
  while (picks.length < count && progressed) {
    progressed = false;
    for (const mu of muscles) {
      if (picks.length >= count) break;
      const list = byMuscle.get(mu) ?? [];
      let i = cursor.get(mu) ?? 0;
      while (i < list.length && used.has(list[i].id)) i += 1;
      cursor.set(mu, i + 1);
      if (i < list.length) {
        picks.push(list[i]);
        used.add(list[i].id);
        progressed = true;
      }
    }
  }
  return picks;
}

/** Build one workout template from its muscle-group blueprint against the dataset. */
function buildTemplate(tpl: StarterTemplate, byMuscle: Map<string, Exercise[]>, coachId: string, now: number): WorkoutTemplate {
  const used = new Set<string>();
  const exercises: Record<string, Exercise> = {};
  const days: WorkoutDay[] = tpl.days.map((d, i) => {
    const picks = pickByMuscles(byMuscle, d.muscles, d.count ?? 6, used);
    for (const e of picks) exercises[e.id] = e;
    return { id: `${tpl.id}-day-${i}`, dayIndex: i, title: d.title, focus: d.focus, exerciseIds: picks.map((e) => e.id) };
  });
  return { id: tpl.id, coachId, name: tpl.name, goal: tpl.goal, splitType: tpl.splitType, days, exercises, createdAt: now, updatedAt: now };
}

/**
 * Seed the comprehensive starter library into `coachAssets/{coachId}`: the
 * shared exercise dataset (fetched), plus the static foods/food-groups and the
 * muscle-blueprint workout templates filled from that dataset. Deterministic
 * `seed-*` ids mean re-running OVERWRITES the starter items (no duplicates) and
 * never touches the coach's own additions. Idempotent.
 */
export async function seedStarterLibrary(coachId: string): Promise<SeedResult> {
  const now = Date.now();
  const exercises = await fetchStarterExercises();
  const byMuscle = groupByMuscle(exercises);
  const foodById = new Map(STARTER_FOODS.map((f) => [f.id, f]));

  await inChunks(exercises, 25, (e) => saveExercise(coachId, e));
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

  await inChunks(STARTER_TEMPLATES, 5, (tpl) => saveWorkoutTemplate(buildTemplate(tpl, byMuscle, coachId, now)));

  return {
    exercises: exercises.length,
    foods: STARTER_FOODS.length,
    groups: STARTER_FOOD_GROUPS.length,
    templates: STARTER_TEMPLATES.length,
  };
}
