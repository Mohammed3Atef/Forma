import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExerciseFields } from './types.js';

/**
 * The shared starter EXERCISE dataset (free-exercise-db, public domain) —
 * the same file `src/services/platform/starterLibraryApi.ts` fetches at
 * runtime as `/data/exercise-library.json`. Read directly off disk here
 * (rather than over HTTP) since this runs server-side; the path is a static,
 * module-relative literal so Vercel's build (node-file-trace) bundles the
 * file alongside the function. Cached at module scope — same "pay the cost
 * once per cold start" pattern as `api/_lib/mongodb.ts`'s connection cache.
 *
 * `import.meta.url` + `fileURLToPath`, not `__dirname` — this module is real
 * ESM (`"type": "module"` + `tsconfig.api.json`'s `"module": "ESNext"`), and
 * Vercel's Node runtime does not polyfill `__dirname` for ESM output; using
 * it here threw "`__dirname` is not defined" at runtime in production
 * (caught by this migration's live verification step, not by local tests —
 * vitest's environment happened to leave `__dirname` defined).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

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
