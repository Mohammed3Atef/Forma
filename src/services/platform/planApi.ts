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

/**
 * Every plan save is guarded server-side (B0 / CO-01): `baseUpdatedAt` is the
 * `updatedAt` of the plan the editor loaded (`null` = creating a new plan);
 * a stale base is rejected with CONFLICT instead of overwriting. Template
 * assignment passes `replaceExisting` instead. Every save is versioned.
 */
export interface PlanSaveOptions {
  baseUpdatedAt?: number | null;
  replaceExisting?: boolean;
  versionReason?: string;
}

export async function saveClientWorkoutPlan(clientId: string, plan: WorkoutPlan, opts: PlanSaveOptions): Promise<WorkoutPlan> {
  return (await trpc.workoutPlan.save.mutate({ ...plan, clientId, ...opts })) as unknown as WorkoutPlan;
}

export async function getClientMealPlan(clientId: string): Promise<MealPlan | null> {
  return trpc.nutritionPlan.get.query({ clientId }) as Promise<MealPlan | null>;
}

export async function saveClientMealPlan(clientId: string, plan: MealPlan, opts: PlanSaveOptions): Promise<MealPlan> {
  return (await trpc.nutritionPlan.save.mutate({ ...plan, clientId, ...opts })) as unknown as MealPlan;
}

export async function getClientCardioPlan(clientId: string): Promise<CardioPlan | null> {
  return trpc.cardioPlan.get.query({ clientId }) as Promise<CardioPlan | null>;
}

export async function saveClientCardioPlan(clientId: string, plan: CardioPlan, opts: PlanSaveOptions): Promise<CardioPlan> {
  return (await trpc.cardioPlan.save.mutate({ ...plan, clientId, ...opts })) as unknown as CardioPlan;
}


/** True when a plan save was refused because the plan changed since it was loaded (B0 / CO-01). */
export function isPlanConflict(e: unknown): boolean {
  const err = e as { data?: { code?: string }; message?: string } | null;
  return err?.data?.code === 'CONFLICT' || /PLAN_CONFLICT/.test(err?.message ?? '');
}
