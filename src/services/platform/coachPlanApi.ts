import { arrayUnion, collection, collectionGroup, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { writeAudit } from './auditApi';
import { notify } from './notificationsApi';
import type { CoachPlan, CoachPlanChangeRequest, PlanRequestStatus } from '@/types';

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
    history: arrayUnion({ at: now, action: 'tier', detail: tier }),
  });
  await writeAudit({ action: 'coachPlan.setTier', targetUserId: coachId, metadata: { tier } });
}

/** Super-admin: extend a coach's trial/term by N days (and (re)activate it). */
export async function extendCoachTrial(coachId: string, days: number): Promise<void> {
  const { db } = ensureFirebase();
  const plan = await getCoachPlan(coachId);
  const now = Date.now();
  const base = Math.max(plan?.endsAt ?? now, now);
  await updateDoc(doc(db, COACH_PLANS, coachId), {
    endsAt: base + days * DAY_MS,
    status: 'active',
    updatedAt: now,
    history: arrayUnion({ at: now, action: 'endsAt', detail: `+${days}d` }),
  });
  await writeAudit({ action: 'coachPlan.extend', targetUserId: coachId, metadata: { days } });
}

/** Super-admin: adjust a coach's client cap directly. */
export async function setCoachMaxClients(coachId: string, maxClients: number): Promise<void> {
  const { db } = ensureFirebase();
  const n = Math.max(0, Math.floor(maxClients));
  const now = Date.now();
  await updateDoc(doc(db, COACH_PLANS, coachId), { maxClients: n, updatedAt: now, history: arrayUnion({ at: now, action: 'maxClients', detail: String(n) }) });
  await writeAudit({ action: 'coachPlan.setMaxClients', targetUserId: coachId, metadata: { maxClients: n } });
}

/** Super-admin: suspend/reactivate a coach PLAN (separate from the account). */
export async function setCoachPlanStatus(coachId: string, status: 'active' | 'suspended'): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, COACH_PLANS, coachId), { status, updatedAt: now, history: arrayUnion({ at: now, action: 'status', detail: status }) });
  await writeAudit({ action: 'coachPlan.setStatus', targetUserId: coachId, metadata: { status } });
}

/** Super-admin: set (or clear) an explicit plan end date. */
export async function setCoachPlanEndsAt(coachId: string, endsAt: number | null): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, COACH_PLANS, coachId), {
    endsAt,
    updatedAt: now,
    history: arrayUnion({ at: now, action: 'endsAt', detail: endsAt ? new Date(endsAt).toISOString().slice(0, 10) : 'cleared' }),
  });
  await writeAudit({ action: 'coachPlan.setEndsAt', targetUserId: coachId, metadata: { endsAt } });
}

/** Effective coach-plan status, folding the trial end date in. */
export function coachPlanState(plan: CoachPlan | null, now = Date.now()): 'trial' | 'active' | 'expired' | 'suspended' | 'none' {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  if (plan.plan === 'trial') return plan.endsAt != null && now >= plan.endsAt ? 'expired' : 'trial';
  return plan.status === 'active' ? 'active' : 'expired';
}

// ---- Coach plan-change requests (coach → super-admin) ----------------------
// Mirrors the client→coach FreezeRequest. Singleton at
// `coachPlans/{coachId}/planChangeRequest/current`.

const REQ = 'planChangeRequest';
const REQ_ID = 'current';

/** Coach: submit (or re-submit) a plan-change / more-clients request. */
export async function submitPlanChangeRequest(
  coachId: string,
  data: { requestedTier?: CoachTierKey; requestedMaxClients?: number; reason: string },
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await setDoc(doc(db, COACH_PLANS, coachId, REQ, REQ_ID), {
    id: REQ_ID,
    coachId,
    reason: data.reason.trim(),
    status: 'pending' as PlanRequestStatus,
    requestedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: now,
    ...(data.requestedTier ? { requestedTier: data.requestedTier } : {}),
    ...(data.requestedMaxClients ? { requestedMaxClients: Math.max(0, Math.floor(data.requestedMaxClients)) } : {}),
  });
}

/** Read a coach's plan-change request (coach reads own; admin reads any). */
export async function getCoachPlanChangeRequest(coachId: string): Promise<CoachPlanChangeRequest | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, COACH_PLANS, coachId, REQ, REQ_ID));
  return snap.exists() ? (snap.data() as CoachPlanChangeRequest) : null;
}

/** Coach: withdraw a pending request. */
export async function cancelPlanChangeRequest(coachId: string): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, COACH_PLANS, coachId, REQ, REQ_ID), { status: 'cancelled', updatedAt: Date.now() });
}

/** Super-admin: every pending plan-change request across all coaches. */
export async function listPendingPlanChangeRequests(): Promise<CoachPlanChangeRequest[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collectionGroup(db, REQ), where('status', '==', 'pending')));
  return snap.docs.map((d) => d.data() as CoachPlanChangeRequest);
}

/**
 * Super-admin: resolve a request (accept/reject) with a note. Applying the
 * actual tier/cap is a separate explicit action (setCoachTier/setCoachMaxClients)
 * so the admin keeps full control over what is granted.
 */
export async function resolvePlanChangeRequest(
  coachId: string,
  decidedBy: string,
  outcome: 'accepted' | 'rejected',
  adminNote: string,
): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await updateDoc(doc(db, COACH_PLANS, coachId, REQ, REQ_ID), {
    status: outcome,
    reviewedAt: now,
    reviewedBy: decidedBy,
    adminNote: adminNote.trim(),
    updatedAt: now,
  });
  // Log the decision on the plan history too (best-effort — a coach without a
  // plan doc shouldn't block the resolution).
  await updateDoc(doc(db, COACH_PLANS, coachId), {
    history: arrayUnion({ at: now, action: `request.${outcome}`, detail: adminNote.trim().slice(0, 120), by: decidedBy }),
    updatedAt: now,
  }).catch(() => undefined);
  // Notify the coach in their own bell that their request was reviewed. Written
  // to clientData/{coachId}/notifications (the coach reads it as the owner; the
  // resolving super-admin writes it via clients.writeAll). Best-effort.
  await notify({
    clientId: coachId,
    forRole: 'coach',
    type: 'plan_decided',
    body: adminNote.trim() || undefined,
    route: '/coach/plan',
    createdBy: decidedBy,
  });
  await writeAudit({ action: `coachPlan.request.${outcome}`, targetUserId: coachId, metadata: { adminNote: adminNote.trim().slice(0, 140) } });
}
