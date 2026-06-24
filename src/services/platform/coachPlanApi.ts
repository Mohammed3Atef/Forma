import { collection, doc, getDoc, getDocs, increment, setDoc, updateDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { CoachPlan } from '@/types';

/**
 * Layer A — the coach's own subscription to Forma, at `coachPlans/{coachId}`.
 * Distinct from the per-client `Subscription` (Layer B) on `coachClients`.
 *
 * A coach self-creates a LOCKED trial on signup (the rules only permit
 * `plan=='trial' && status=='active' && maxClients==TRIAL_MAX_CLIENTS` for a
 * self-create, and forbid the coach from ever changing plan/status/maxClients
 * afterwards). The coach may only patch `trialNotified` (expiry reminders) and
 * `activeClientCount` (usage bookkeeping) on their own plan.
 */

const COACH_PLANS = 'coachPlans';

/** Trial defaults — mirrored in firestore.rules. Keep the two in sync. */
export const TRIAL_MAX_CLIENTS = 10;
export const TRIAL_DURATION_DAYS = 15;
const DAY_MS = 86_400_000;

export async function getCoachPlan(coachId: string): Promise<CoachPlan | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, COACH_PLANS, coachId));
  return snap.exists() ? (snap.data() as CoachPlan) : null;
}

/**
 * Creates the coach's auto trial plan. Idempotent: if a plan already exists it
 * is returned untouched (never downgrades an upgraded/paid plan). Called at
 * coach signup from the session sign-in path.
 */
export async function createTrialPlan(coachId: string): Promise<CoachPlan> {
  const existing = await getCoachPlan(coachId);
  if (existing) return existing;
  const now = Date.now();
  const plan: CoachPlan = {
    coachId,
    plan: 'trial',
    status: 'active',
    maxClients: TRIAL_MAX_CLIENTS,
    startedAt: now,
    endsAt: now + TRIAL_DURATION_DAYS * DAY_MS,
    trialNotified: {},
    activeClientCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const { db } = ensureFirebase();
  await setDoc(doc(db, COACH_PLANS, coachId), plan);
  return plan;
}

/**
 * Mark a trial-expiry reminder as sent so it never fires twice. Only the
 * `trialNotified` map (+ updatedAt) is touched — the only field a coach may
 * mutate on their own plan besides the counter.
 */
export async function markTrialNotified(coachId: string, key: 'd7' | 'd3' | 'd1'): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, COACH_PLANS, coachId), {
    [`trialNotified.${key}`]: true,
    updatedAt: Date.now(),
  });
}

/**
 * Adjust the maintained `activeClientCount` by `delta` (+1 on assign, -1 on
 * unassign/trash). Best-effort: a drift is reconciled by
 * scripts/reconcile-client-counts.mjs. Never blocks the primary action.
 */
export async function bumpActiveClientCount(coachId: string, delta: number): Promise<void> {
  try {
    const { db } = ensureFirebase();
    await updateDoc(doc(db, COACH_PLANS, coachId), {
      activeClientCount: increment(delta),
      updatedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[coachPlan] activeClientCount bump failed (non-fatal):', e);
  }
}

/** Days remaining on the trial (rounded up), or null when the plan has no end. */
export function trialDaysLeft(plan: Pick<CoachPlan, 'endsAt'>, now = Date.now()): number | null {
  if (plan.endsAt == null) return null;
  return Math.ceil((plan.endsAt - now) / DAY_MS);
}

// ---- Coach plan tiers (Layer A). Tracking only — no payment gateway. ----
export type CoachTierKey = 'trial' | 'starter' | 'pro' | 'enterprise';
/** Client cap + indicative monthly price per tier. priceMonthly is a tracking
 * placeholder (0) until tiers are priced — no gateway is involved. */
export const COACH_PLAN_TIERS: Record<CoachTierKey, { maxClients: number; priceMonthly: number }> = {
  trial: { maxClients: TRIAL_MAX_CLIENTS, priceMonthly: 0 },
  starter: { maxClients: 25, priceMonthly: 0 },
  pro: { maxClients: 100, priceMonthly: 0 },
  enterprise: { maxClients: 1000, priceMonthly: 0 },
};

/** Super-admin: list every coach plan (rules allow read via users.read). */
export async function listAllCoachPlans(): Promise<CoachPlan[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(collection(db, COACH_PLANS));
  return snap.docs.map((d) => d.data() as CoachPlan);
}

/** Super-admin: upgrade/downgrade a coach to a tier (sets the cap + activates). */
export async function setCoachTier(coachId: string, tier: CoachTierKey): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, COACH_PLANS, coachId), {
    plan: tier,
    maxClients: COACH_PLAN_TIERS[tier].maxClients,
    status: 'active',
    endsAt: tier === 'trial' ? now + TRIAL_DURATION_DAYS * DAY_MS : null,
    updatedAt: now,
  });
}

/** Super-admin: extend a coach's trial/term by N days (and (re)activate it). */
export async function extendCoachTrial(coachId: string, days: number): Promise<void> {
  const { db } = ensureFirebase();
  const plan = await getCoachPlan(coachId);
  const now = Date.now();
  const base = Math.max(plan?.endsAt ?? now, now);
  await updateDoc(doc(db, COACH_PLANS, coachId), { endsAt: base + days * DAY_MS, status: 'active', updatedAt: now });
}

/** Super-admin: adjust a coach's client cap directly. */
export async function setCoachMaxClients(coachId: string, maxClients: number): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, COACH_PLANS, coachId), { maxClients: Math.max(0, Math.floor(maxClients)), updatedAt: Date.now() });
}

/** Super-admin: suspend/reactivate a coach PLAN (separate from the account). */
export async function setCoachPlanStatus(coachId: string, status: 'active' | 'suspended'): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, COACH_PLANS, coachId), { status, updatedAt: Date.now() });
}

/** Effective coach-plan status, folding the trial end date in. */
export function coachPlanState(plan: CoachPlan | null, now = Date.now()): 'trial' | 'active' | 'expired' | 'suspended' | 'none' {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  if (plan.plan === 'trial') return plan.endsAt != null && now >= plan.endsAt ? 'expired' : 'trial';
  return plan.status === 'active' ? 'active' : 'expired';
}
