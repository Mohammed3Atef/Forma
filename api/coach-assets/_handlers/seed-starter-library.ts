import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach } from '../_lib/access.js';
import { coachExercisesCol, coachFoodGroupsCol, coachFoodsCol, coachWorkoutTemplatesCol } from '../_lib/db.js';
import { loadStarterExercises } from '../_lib/exerciseLibrary.js';
import { STARTER_FOODS, STARTER_FOOD_GROUPS, STARTER_TEMPLATES, type StarterFood } from '../_lib/starterLibraryData.js';
import { buildTemplate, groupByMuscle } from '../_lib/starterLibraryBuild.js';
import type { CoachExerciseDoc, CoachFoodDoc, CoachFoodGroupDoc, StoredFood } from '../_lib/types.js';
import { handleError, methodGuard } from '../../_lib/http.js';

/**
 * POST /api/coach-assets/seed-starter-library
 *
 * Ports `src/services/platform/starterLibraryApi.ts`'s `seedStarterLibrary`:
 * seeds the shared exercise dataset, static starter foods/food-groups, and the
 * muscle-blueprint workout templates (filled from that dataset) into the
 * calling coach's own asset collections.
 *
 * IDEMPOTENCY: unlike the Firestore-era version (which used deterministic
 * `seed-*` ids and OVERWROTE on every re-run), this route follows this
 * codebase's backfill-script precedent (see `scripts/backfill-coach-plans.mjs`)
 * of being non-destructive — it only INSERTS whichever seed rows the coach
 * doesn't already have (by id) and never touches existing docs, seeded or
 * coach-authored.
 */

interface SeedCounts {
  inserted: number;
  skipped: number;
}
interface SeedResult {
  exercises: SeedCounts;
  foods: SeedCounts;
  groups: SeedCounts;
  templates: SeedCounts;
}

async function existingIds<T extends { _id: string }>(
  col: { find: (filter: Record<string, unknown>, opts: Record<string, unknown>) => { toArray: () => Promise<T[]> } },
  coachId: string,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await col.find({ coachId, _id: { $in: ids } }, { projection: { _id: 1 } }).toArray();
  return new Set(rows.map((r) => r._id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const coachId = user.id;
    const now = Date.now();

    // ---- Exercises ----------------------------------------------------
    const exercises = loadStarterExercises();
    const exCol = await coachExercisesCol();
    const haveExIds = await existingIds(exCol, coachId, exercises.map((e) => e.id));
    const newExercises: CoachExerciseDoc[] = exercises
      .filter((e) => !haveExIds.has(e.id))
      .map((e) => ({ ...e, _id: e.id, coachId, createdAt: now, updatedAt: now }));
    if (newExercises.length) await exCol.insertMany(newExercises);

    // ---- Foods ----------------------------------------------------------
    const foodById = new Map<string, StarterFood>(STARTER_FOODS.map((f) => [f.id, f]));
    const foodsCol = await coachFoodsCol();
    const haveFoodIds = await existingIds(foodsCol, coachId, STARTER_FOODS.map((f) => f.id));
    const newFoods: CoachFoodDoc[] = STARTER_FOODS.filter((f) => !haveFoodIds.has(f.id)).map((f) => ({
      ...f,
      _id: f.id,
      coachId,
      createdAt: now,
      updatedAt: now,
    }));
    if (newFoods.length) await foodsCol.insertMany(newFoods);

    // ---- Food groups ------------------------------------------------------
    const fgCol = await coachFoodGroupsCol();
    const haveFgIds = await existingIds(fgCol, coachId, STARTER_FOOD_GROUPS.map((g) => g.id));
    const newGroups: CoachFoodGroupDoc[] = STARTER_FOOD_GROUPS.filter((g) => !haveFgIds.has(g.id)).map((g) => {
      const foods: StoredFood[] = g.foodIds.map((id) => foodById.get(id)).filter((f): f is StarterFood => Boolean(f));
      return {
        _id: g.id,
        coachId,
        name: g.name,
        foods,
        ...(g.notes ? { notes: g.notes } : {}),
        createdAt: now,
        updatedAt: now,
      };
    });
    if (newGroups.length) await fgCol.insertMany(newGroups);

    // ---- Workout templates --------------------------------------------
    const byMuscle = groupByMuscle(exercises);
    const wtCol = await coachWorkoutTemplatesCol();
    const haveWtIds = await existingIds(wtCol, coachId, STARTER_TEMPLATES.map((t) => t.id));
    const newTemplates = STARTER_TEMPLATES.filter((t) => !haveWtIds.has(t.id)).map((t) => buildTemplate(t, byMuscle, coachId, now));
    if (newTemplates.length) await wtCol.insertMany(newTemplates);

    const result: SeedResult = {
      exercises: { inserted: newExercises.length, skipped: exercises.length - newExercises.length },
      foods: { inserted: newFoods.length, skipped: STARTER_FOODS.length - newFoods.length },
      groups: { inserted: newGroups.length, skipped: STARTER_FOOD_GROUPS.length - newGroups.length },
      templates: { inserted: newTemplates.length, skipped: STARTER_TEMPLATES.length - newTemplates.length },
    };
    res.status(200).json(result);
  } catch (e) {
    handleError(res, e);
  }
}
