import { pickFromLibrary } from './workoutPresets';
import { getCatalogExercise, getCatalogExercises, type CatalogTaxonomy } from '@/services/platform/catalogApi';
import { getExercise } from '@/services/platform/coachAssetsApi';
import type { LibraryExerciseRow } from '@/services/platform/libraryApi';
import type { Exercise } from '@/types';

/**
 * B4.3 — using a library item in a plan, wherever it was picked (Library, workout builder, template
 * editor, "Use in a client plan"). The two kinds of library rows become plan exercises the same way
 * everywhere:
 *  - a Forma (shared) exercise → a full snapshot copy (`exerciseFromCatalog`: names, steps, media and
 *    credits, catalog id + revision) — no "save to my library" first;
 *  - the coach's own exercise (or their customised version of a Forma one) → a library-linked copy
 *    (`pickFromLibrary`), so later edits to it reach templates as before.
 */

/** Catalog exercise ids: curated `fx_…` and ExerciseDB `edb_…` (foods: `foodHandoff`). */
export const isCatalogExerciseId = (id: string): boolean => /^(fx|edb)_/.test(id);

/** The plan copies of picked rows, in the order picked. Forma exercises are fetched in full now. */
export async function planExercisesFrom(rows: LibraryExerciseRow[], taxonomy: CatalogTaxonomy): Promise<Exercise[]> {
  const sharedIds = rows.filter((r) => r.kind === 'shared').map((r) => r.id);
  const full = sharedIds.length ? await getCatalogExercises(sharedIds) : [];
  const byId = new Map(full.map((e) => [e.id, e]));
  const copy = full.length ? (await import('./catalogCopy')).exerciseFromCatalog : null; // loads with the first Forma pick
  return rows.flatMap((r): Exercise[] => {
    if (r.kind === 'own') return [pickFromLibrary(r.exercise as unknown as Exercise)];
    const e = byId.get(r.id);
    return e && copy ? [copy(e, taxonomy)] : [];
  });
}

/**
 * One item handed to a plan editor by id (`?addExercise=`): a Forma exercise becomes its snapshot
 * (`linked: false`), the coach's own exercise is library-linked by the editor (`linked: true`).
 */
export async function exerciseForPlan(coachId: string, id: string, taxonomy: () => Promise<CatalogTaxonomy>): Promise<{ exercise: Exercise; linked: boolean }> {
  if (!isCatalogExerciseId(id)) return { exercise: await getExercise(coachId, id), linked: true };
  const [e, tx, { exerciseFromCatalog }] = await Promise.all([getCatalogExercise(id), taxonomy(), import('./catalogCopy')]);
  return { exercise: exerciseFromCatalog(e, tx), linked: false };
}
