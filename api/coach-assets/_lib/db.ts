import { Collection, Db } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import type {
  CoachBillingPlanDoc,
  CoachExerciseDoc,
  CoachFoodDoc,
  CoachFoodGroupDoc,
  CoachNutritionTemplateDoc,
  CoachSupplementDoc,
  CoachWorkoutTemplateDoc,
} from './types.js';

/**
 * Local collection accessors for the seven flattened `coachAssets/{coachId}/...`
 * collections (see `./types.ts`). Mirrors the shape of `api/_lib/mongodb.ts`'s
 * `usersCol()` etc., but kept in `api/coach-assets/` since this module is
 * owned by this route group only (per the parallel-work ground rules).
 *
 * Every accessor ensures the `{coachId, id}` unique compound index exists
 * before handing back the collection — this is what makes a duplicate
 * `{coachId, id}` write a real, DB-enforced rejection rather than something
 * only the application layer's find-before-write check happens to catch (see
 * the identity-model comment in `./types.ts`). Deliberately NOT memoized
 * beyond Mongo's own `createIndex` idempotency (a no-op, sub-millisecond
 * round trip when the index already exists with the same spec) — a
 * persistent in-process memo would go stale the moment a database gets
 * dropped/recreated without the process restarting (exactly what this
 * module's own test suite does in `beforeEach`), silently leaving the
 * uniqueness guarantee unenforced. `scripts/mongo-init-indexes.mjs` also
 * creates the same index for a fresh/ops-provisioned database, but the app
 * no longer depends on that script having been run first.
 */
const ASSET_COLLECTIONS = ['coachExercises', 'coachWorkoutTemplates', 'coachNutritionTemplates', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachBillingPlans'] as const;

async function ensureCoachAssetIndexes(db: Db): Promise<void> {
  await Promise.all(
    ASSET_COLLECTIONS.map((name) => db.collection(name).createIndex({ coachId: 1, id: 1 }, { unique: true, name: 'uniq_coachId_id' })),
  );
}

export async function coachExercisesCol(): Promise<Collection<CoachExerciseDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachExerciseDoc>('coachExercises');
}

export async function coachWorkoutTemplatesCol(): Promise<Collection<CoachWorkoutTemplateDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachWorkoutTemplateDoc>('coachWorkoutTemplates');
}

export async function coachNutritionTemplatesCol(): Promise<Collection<CoachNutritionTemplateDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachNutritionTemplateDoc>('coachNutritionTemplates');
}

export async function coachFoodsCol(): Promise<Collection<CoachFoodDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachFoodDoc>('coachFoods');
}

export async function coachFoodGroupsCol(): Promise<Collection<CoachFoodGroupDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachFoodGroupDoc>('coachFoodGroups');
}

export async function coachBillingPlansCol(): Promise<Collection<CoachBillingPlanDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachBillingPlanDoc>('coachBillingPlans');
}

export async function coachSupplementsCol(): Promise<Collection<CoachSupplementDoc>> {
  const db = await getDb();
  await ensureCoachAssetIndexes(db);
  return db.collection<CoachSupplementDoc>('coachSupplements');
}
