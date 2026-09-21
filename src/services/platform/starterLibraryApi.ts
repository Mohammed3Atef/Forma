import { trpc } from '@/services/trpc';
import type { Exercise } from '@/types';

export interface SeedResult {
  exercises: number;
  foods: number;
  groups: number;
  supplements: number;
  templates: number;
  /** Any category that failed to seed (rare — a transient DB error) — the OTHERS still complete independently. See `runSeedStep` on the backend. */
  errors: { category: string; message: string }[];
}

interface SeedCounts {
  inserted: number;
  skipped: number;
  error?: string;
}
interface SeedApiResult {
  exercises: SeedCounts;
  foods: SeedCounts;
  groups: SeedCounts;
  supplements: SeedCounts;
  templates: SeedCounts;
}

/**
 * The shared starter EXERCISE dataset (wger.de, CC BY-SA 3.0) at
 * `public/data/exercise-library.json`. Fetched at runtime so the ~150 KB
 * (gzipped) of exercise data never bloats the JS bundle. This is the single
 * source of truth for starter exercises — both "Load starter library" and
 * the coach library's one-tap import read it.
 */
export async function fetchStarterExercises(): Promise<Exercise[]> {
  const res = await fetch('/data/exercise-library.json');
  if (!res.ok) throw new Error('Failed to load exercise library');
  return (await res.json()) as Exercise[];
}

/**
 * Seed the comprehensive starter library into the calling coach's own asset
 * collections: the shared exercise dataset, static foods/food-groups/
 * supplements, and the muscle-blueprint workout templates — all FIVE
 * categories from ONE call (there's no separate "load" button per tab). The
 * backend (`coachAssets.seedStarterLibrary`) owns the seed content and the
 * idempotency logic — it only inserts rows the coach doesn't already have (by
 * id) and never touches existing docs, seeded or coach-authored; each
 * category runs independently, so one failing (surfaced in `errors`) never
 * silently blocks the others. Safe to call again later — already-seeded
 * categories just report 0 inserted.
 */
export async function seedStarterLibrary(_coachId: string): Promise<SeedResult> {
  const result: SeedApiResult = await trpc.coachAssets.seedStarterLibrary.mutate();
  const errors = (Object.entries(result) as [string, SeedCounts][])
    .filter(([, v]) => v.error)
    .map(([category, v]) => ({ category, message: v.error! }));
  return {
    exercises: result.exercises.inserted + result.exercises.skipped,
    foods: result.foods.inserted + result.foods.skipped,
    groups: result.groups.inserted + result.groups.skipped,
    supplements: result.supplements.inserted + result.supplements.skipped,
    templates: result.templates.inserted + result.templates.skipped,
    errors,
  };
}
