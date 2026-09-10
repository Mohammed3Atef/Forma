import { Collection } from 'mongodb';
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
 * Local collection accessors for the six flattened `coachAssets/{coachId}/...`
 * collections (see `./types.ts`). Mirrors the shape of `api/_lib/mongodb.ts`'s
 * `usersCol()` etc., but kept in `api/coach-assets/` since this module is
 * owned by this route group only (per the parallel-work ground rules).
 */

export async function coachExercisesCol(): Promise<Collection<CoachExerciseDoc>> {
  return (await getDb()).collection<CoachExerciseDoc>('coachExercises');
}

export async function coachWorkoutTemplatesCol(): Promise<Collection<CoachWorkoutTemplateDoc>> {
  return (await getDb()).collection<CoachWorkoutTemplateDoc>('coachWorkoutTemplates');
}

export async function coachNutritionTemplatesCol(): Promise<Collection<CoachNutritionTemplateDoc>> {
  return (await getDb()).collection<CoachNutritionTemplateDoc>('coachNutritionTemplates');
}

export async function coachFoodsCol(): Promise<Collection<CoachFoodDoc>> {
  return (await getDb()).collection<CoachFoodDoc>('coachFoods');
}

export async function coachFoodGroupsCol(): Promise<Collection<CoachFoodGroupDoc>> {
  return (await getDb()).collection<CoachFoodGroupDoc>('coachFoodGroups');
}

export async function coachBillingPlansCol(): Promise<Collection<CoachBillingPlanDoc>> {
  return (await getDb()).collection<CoachBillingPlanDoc>('coachBillingPlans');
}

export async function coachSupplementsCol(): Promise<Collection<CoachSupplementDoc>> {
  return (await getDb()).collection<CoachSupplementDoc>('coachSupplements');
}
