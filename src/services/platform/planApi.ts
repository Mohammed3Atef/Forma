import { trpc } from '@/services/trpc';
import type { CardioPlan, MealPlan, WorkoutPlan } from '@/types';

/**
 * Coach-authored rich plans over the tRPC singleton procedures:
 *   workoutPlan.get/save    → WorkoutPlan
 *   nutritionPlan.get/save  → MealPlan
 *   cardioPlan.get/save     → CardioPlan
 * (port of `clientData/{clientId}/plan/{workout|nutrition|cardio}`, then the
 * Mongo-backed `/api/client/*-plan` REST routes). Coaches (and admins with
 * clients.writeAll) write these; the client reads its own and renders them
 * through the existing tracker UI — a client with no assigned plan gets
 * `null` (the "waiting for your coach" state). The backend already strips its
 * internal `_id`/`clientId` fields, so responses match these types as-is.
 */

export async function getClientWorkoutPlan(clientId: string): Promise<WorkoutPlan | null> {
  return trpc.workoutPlan.get.query({ clientId }) as Promise<WorkoutPlan | null>;
}

export async function saveClientWorkoutPlan(clientId: string, plan: WorkoutPlan): Promise<void> {
  await trpc.workoutPlan.save.mutate({ clientId, ...plan });
}

export async function getClientMealPlan(clientId: string): Promise<MealPlan | null> {
  return trpc.nutritionPlan.get.query({ clientId }) as Promise<MealPlan | null>;
}

export async function saveClientMealPlan(clientId: string, plan: MealPlan): Promise<void> {
  await trpc.nutritionPlan.save.mutate({ clientId, ...plan });
}

export async function getClientCardioPlan(clientId: string): Promise<CardioPlan | null> {
  return trpc.cardioPlan.get.query({ clientId }) as Promise<CardioPlan | null>;
}

export async function saveClientCardioPlan(clientId: string, plan: CardioPlan): Promise<void> {
  await trpc.cardioPlan.save.mutate({ clientId, ...plan });
}
