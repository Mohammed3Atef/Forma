import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExerciseFields } from './types';

/**
 * The shared starter EXERCISE dataset (free-exercise-db, public domain) —
 * the same file `src/services/platform/starterLibraryApi.ts` fetches at
 * runtime as `/data/exercise-library.json`. Read directly off disk here
 * (rather than over HTTP) since this runs server-side; the path is a static,
 * `__dirname`-relative literal so Vercel's build (node-file-trace) bundles the
 * file alongside the function. Cached at module scope — same "pay the cost
 * once per cold start" pattern as `api/_lib/mongodb.ts`'s connection cache.
 */

export interface StarterExercise extends ExerciseFields {
  id: string;
}

let cached: StarterExercise[] | null = null;

export function loadStarterExercises(): StarterExercise[] {
  if (cached) return cached;
  const path = join(__dirname, '../../../public/data/exercise-library.json');
  const raw = readFileSync(path, 'utf-8');
  cached = JSON.parse(raw) as StarterExercise[];
  return cached;
}
