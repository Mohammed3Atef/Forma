import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import type { CoachSubscriptionPlan } from '@/types';

/**
 * Coach-defined client subscription plans at `coachAssets/{coachId}/plans/{id}`.
 * Owned by the coach (the recursive `coachAssets/{coachId}` rule already grants
 * owner CRUD — no rules change). Clients never read these; they only ever see the
 * resulting `Subscription` on their own relationship doc.
 */
const ASSETS = 'coachAssets';
const PLANS = 'plans';

/** All plans for a coach, ordered (active first unless includeArchived). */
export async function listCoachPlans(coachId: string, includeArchived = false): Promise<CoachSubscriptionPlan[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, ASSETS, coachId, PLANS));
  return snap.docs
    .map((d) => d.data() as CoachSubscriptionPlan)
    .filter((p) => includeArchived || !p.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
}

/** Create or update a plan (id assigned for new plans). Returns the saved plan. */
export async function saveCoachPlan(
  input: Omit<CoachSubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
): Promise<CoachSubscriptionPlan> {
  const { db } = ensureFirebase();
  const now = Date.now();
  const plan: CoachSubscriptionPlan = {
    id: input.id ?? uid('plan'),
    coachId: input.coachId,
    name: input.name.trim(),
    unit: input.unit,
    duration: input.duration,
    ...(typeof input.price === 'number' ? { price: input.price } : {}),
    ...(input.isTrial ? { isTrial: true } : {}),
    ...(typeof input.order === 'number' ? { order: input.order } : {}),
    ...(input.archived ? { archived: true } : {}),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
  await setDoc(doc(db, ASSETS, plan.coachId, PLANS, plan.id), plan);
  return plan;
}

/** Hard-delete a plan (it's a reusable template; assigned subscriptions are independent snapshots). */
export async function deleteCoachPlan(coachId: string, planId: string): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, ASSETS, coachId, PLANS, planId));
}
