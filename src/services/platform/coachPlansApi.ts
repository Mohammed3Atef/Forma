import { trpc } from '@/services/trpc';
import { uid } from '@/lib/utils';
import type { CoachSubscriptionPlan } from '@/types';

/**
 * Coach-defined client subscription plans, backed by the Mongo
 * `coachBillingPlans` collection via `/api/coach-assets/billing-plans*` (was
 * Firestore `coachAssets/{coachId}/plans/{id}`). Owned by the coach (writes
 * are always scoped server-side to the caller's own coachId). Clients never
 * read these; they only ever see the resulting `Subscription` on their own
 * relationship doc.
 */

/** All plans for a coach, ordered (active first unless includeArchived). */
export async function listCoachPlans(coachId: string, includeArchived = false): Promise<CoachSubscriptionPlan[]> {
  const docs = await trpc.coachAssets.billingPlans.list.query({ coachId });
  return docs
    .filter((p) => includeArchived || !p.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
}

/** Create or update a plan (id assigned for new plans). Returns the saved plan. */
export async function saveCoachPlan(
  input: Omit<CoachSubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
): Promise<CoachSubscriptionPlan> {
  const id = input.id ?? uid('plan');
  return trpc.coachAssets.billingPlans.save.mutate({
    id,
    name: input.name.trim(),
    unit: input.unit,
    duration: input.duration,
    ...(typeof input.price === 'number' ? { price: input.price } : {}),
    ...(input.isTrial ? { isTrial: true } : {}),
    ...(typeof input.order === 'number' ? { order: input.order } : {}),
    ...(input.archived ? { archived: true } : {}),
  });
}

/** Hard-delete a plan (it's a reusable template; assigned subscriptions are independent snapshots). */
export async function deleteCoachPlan(coachId: string, planId: string): Promise<void> {
  void coachId; // ownership is enforced server-side from the auth token
  await trpc.coachAssets.billingPlans.delete.mutate({ id: planId });
}
