import { trpc } from '@/services/trpc';
import type { Exercise } from '@/types';

export interface SeedResult {
  exercises: number;
  foods: number;
  groups: number;
  templates: number;
}

interface SeedCounts {
  inserted: number;
  skipped: number;
}
interface SeedApiResult {
  exercises: SeedCounts;
  foods: SeedCounts;
  groups: SeedCounts;
  templates: SeedCounts;
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

/**
 * Seed the comprehensive starter library into the calling coach's own asset
 * collections: the shared exercise dataset, static foods/food-groups, and the
 * muscle-blueprint workout templates. The backend (`POST
 * /api/coach-assets/seed-starter-library`) owns the seed content and the
 * idempotency logic — it only inserts rows the coach doesn't already have (by
 * id) and never touches existing docs, seeded or coach-authored. We collapse
 * its per-category `{inserted, skipped}` counts into the single "how many are
 * now in your library" totals this function has always returned.
 */
export async function seedStarterLibrary(_coachId: string): Promise<SeedResult> {
  const result: SeedApiResult = await trpc.coachAssets.seedStarterLibrary.mutate();
  return {
    exercises: result.exercises.inserted + result.exercises.skipped,
    foods: result.foods.inserted + result.foods.skipped,
    groups: result.groups.inserted + result.groups.skipped,
    templates: result.templates.inserted + result.templates.skipped,
  };
}
