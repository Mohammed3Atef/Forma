import { apiGet, apiPut } from '@/services/platformApi';
import type { CardioPlan, MealPlan, WorkoutPlan } from '@/types';

/**
 * Coach-authored rich plans over the Mongo-backed singleton routes:
 *   GET/PUT /api/client/workout-plan    → WorkoutPlan
 *   GET/PUT /api/client/nutrition-plan  → MealPlan
 *   GET/PUT /api/client/cardio-plan     → CardioPlan
 * (port of `clientData/{clientId}/plan/{workout|nutrition|cardio}`). Coaches
 * (and admins with clients.writeAll) write these; the client reads its own
 * and renders them through the existing tracker UI — a client with no
 * assigned plan gets `null` (the "waiting for your coach" state). The backend
 * already strips its internal `_id`/`clientId` fields, so responses match
 * these types as-is.
 */

/** Builds a `?a=1&b=2` query string, skipping undefined values. */
function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export async function getClientWorkoutPlan(clientId: string): Promise<WorkoutPlan | null> {
  return apiGet<WorkoutPlan | null>(`/client/workout-plan${qs({ clientId })}`);
}

export async function saveClientWorkoutPlan(clientId: string, plan: WorkoutPlan): Promise<void> {
  await apiPut(`/client/workout-plan${qs({ clientId })}`, { clientId, ...plan });
}

export async function getClientMealPlan(clientId: string): Promise<MealPlan | null> {
  return apiGet<MealPlan | null>(`/client/nutrition-plan${qs({ clientId })}`);
}

export async function saveClientMealPlan(clientId: string, plan: MealPlan): Promise<void> {
  await apiPut(`/client/nutrition-plan${qs({ clientId })}`, { clientId, ...plan });
}

export async function getClientCardioPlan(clientId: string): Promise<CardioPlan | null> {
  return apiGet<CardioPlan | null>(`/client/cardio-plan${qs({ clientId })}`);
}

export async function saveClientCardioPlan(clientId: string, plan: CardioPlan): Promise<void> {
  await apiPut(`/client/cardio-plan${qs({ clientId })}`, { clientId, ...plan });
}
