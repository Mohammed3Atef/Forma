import { trpc, TRPCClientError } from '@/services/trpc';
import { writeAudit } from './auditApi';
import type { CoachPlan } from '@/types';

/**
 * Layer A — the coach's own subscription to Forma, backed by the Mongo
 * `coachPlans` collection via `coachPlans.*`. Distinct from the per-client
 * `Subscription` (Layer B) on `coachClients`.
 *
 * Plan-REQUEST lifecycle (submit/cancel/list/confirm/reject a paid-plan
 * request) lives in `coachPlanRequestsApi.ts` now — a coach's active plan
 * ALWAYS comes from `CoachPlan` here, never from an unconfirmed request.
 */

/** Trial defaults — mirrored server-side in `api/coach-plans/_data.ts`. Keep the two in sync. Only the BOOTSTRAP fallback — the real source of truth is the `trial` tier's own `trialDurationDays`/`maxClients` (see `coachPlanTiersApi.ts`). */
export const TRIAL_MAX_CLIENTS = 2;
export const TRIAL_DURATION_DAYS = 15;
/** Default renewal cycle for paid tiers (renewals are manual — no payment gateway). */
export const PAID_TERM_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Reads the signed-in coach's own plan via `coachPlans.me`. For a non-coach
 * caller (a super-admin viewing another coach's plan from
 * `AdminCoachDetail.tsx`), `coachPlans.me` 403s (there is no dedicated
 * "read any coach's plan" procedure under `coachPlans.*`), so this falls back
 * to the admin coach-detail procedure (`adminCoaches.detail`), which embeds
 * the same doc shape under `.plan`.
 */
export async function getCoachPlan(coachId: string): Promise<CoachPlan | null> {
  try {
    return await trpc.coachPlans.me.query();
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === 'NOT_FOUND') return null;
    if (!(e instanceof TRPCClientError) || e.data?.code !== 'FORBIDDEN') throw e;
  }
  try {
    const detail = await trpc.adminCoaches.detail.query({ id: coachId });
    return (detail.plan as CoachPlan | null) ?? null;
  } catch (e) {
    if (e instanceof TRPCClientError && (e.data?.code === 'NOT_FOUND' || e.data?.code === 'FORBIDDEN')) return null;
    throw e;
  }
}

/**
 * Creates the coach's auto trial plan. Idempotent server-side: if a plan
 * already exists (of any tier, even upgraded/paid) it is returned untouched.
 * Kept for any direct caller — `auth.signup` now assigns this itself
 * server-side via `ensureTrialPlan`, so this is no longer on the critical
 * signup path.
 */
export async function createTrialPlan(coachId: string): Promise<CoachPlan> {
  void coachId; // the backend resolves the coach from the auth token, not a client-supplied id
  return trpc.coachPlans.createTrial.mutate();
}

/**
 * Mark a trial-expiry reminder as sent so it never fires twice. No self-service
 * route persists this flag today (the admin `PATCH /coach-plans/:coachId`
 * route is `users.manageStatus`-gated and doesn't expose `trialNotified`), so
 * this is a deliberate no-op until a dedicated route exists. Every caller
 * (`checkTrialExpiry`) already treats this as best-effort/non-fatal.
 */
export async function markTrialNotified(coachId: string, key: 'd7' | 'd5' | 'd3' | 'd1'): Promise<void> {
  void coachId;
  void key;
}

/**
 * Adjust the maintained `activeClientCount` by `delta`. The Mongo
 * `coach-clients` API now maintains this counter itself server-side on
 * assign/unassign (see `api/coach-clients/_data.ts`), so this is a no-op kept
 * only so existing callers compile/behave unchanged — every call site already
 * treats this as best-effort/non-fatal bookkeeping.
 */
export async function bumpActiveClientCount(coachId: string, delta: number): Promise<void> {
  void coachId;
  void delta;
}

/** Days remaining on the trial (rounded up), or null when the plan has no end. */
export function trialDaysLeft(plan: Pick<CoachPlan, 'endsAt'>, now = Date.now()): number | null {
  if (plan.endsAt == null) return null;
  return Math.ceil((plan.endsAt - now) / DAY_MS);
}

// ---- Coach plan tiers (Layer A). Tracking only — no payment gateway. ----
/** Built-ins below; admins can add custom tier keys (see coachPlanTiersApi). */
export type CoachTierKey = string;
/** Client cap + indicative monthly price per tier. priceMonthly is a tracking
 * placeholder (0) until tiers are priced — no gateway is involved. */
export const COACH_PLAN_TIERS: Record<CoachTierKey, { maxClients: number; priceMonthly: number }> = {
  trial: { maxClients: TRIAL_MAX_CLIENTS, priceMonthly: 0 },
  starter: { maxClients: 25, priceMonthly: 0 },
  pro: { maxClients: 100, priceMonthly: 0 },
  enterprise: { maxClients: 1000, priceMonthly: 0 },
};

/** Super-admin: list every coach plan, via the aggregate `adminCoaches.list` (embeds each coach's plan). */
export async function listAllCoachPlans(): Promise<CoachPlan[]> {
  const data = await trpc.adminCoaches.list.query();
  return data.rows.map((r) => r.plan).filter((p) => p !== null) as unknown as CoachPlan[];
}

/** Super-admin: upgrade/downgrade a coach to a tier (sets the cap + activates). */
export async function setCoachTier(coachId: string, tier: CoachTierKey): Promise<void> {
  await trpc.coachPlans.adminUpdate.mutate({ coachId, tier });
  await writeAudit({ action: 'coachPlan.setTier', targetUserId: coachId, metadata: { tier } });
}

/**
 * Super-admin: extend a coach's trial/term by N days (and (re)activate it).
 *
 * NOTE: `PATCH /coach-plans/:coachId` only recomputes `endsAt` (as `now` plus
 * the tier's STANDARD term) when `tier` is included in the body — there is no
 * arbitrary day-offset field. This re-applies the coach's current tier to push
 * the term out by its standard length rather than compounding an arbitrary
 * `days` count on top of the existing `endsAt`; every caller today only ever
 * passes the standard term length anyway.
 */
export async function extendCoachTrial(coachId: string, days: number): Promise<void> {
  const plan = await getCoachPlan(coachId);
  await trpc.coachPlans.adminUpdate.mutate({ coachId, tier: plan?.plan ?? 'trial' });
  await writeAudit({ action: 'coachPlan.extend', targetUserId: coachId, metadata: { days } });
}

/** Super-admin: renew a coach's term (default a full paid cycle) and (re)activate. See `extendCoachTrial` for the same day-offset caveat. */
export async function renewCoachPlan(coachId: string, days = PAID_TERM_DAYS): Promise<void> {
  const plan = await getCoachPlan(coachId);
  await trpc.coachPlans.adminUpdate.mutate({ coachId, tier: plan?.plan ?? 'trial' });
  await writeAudit({ action: 'coachPlan.renew', targetUserId: coachId, metadata: { days } });
}

/** Super-admin: adjust a coach's client cap directly. */
export async function setCoachMaxClients(coachId: string, maxClients: number): Promise<void> {
  const n = Math.max(0, Math.floor(maxClients));
  await trpc.coachPlans.adminUpdate.mutate({ coachId, maxClients: n });
  await writeAudit({ action: 'coachPlan.setMaxClients', targetUserId: coachId, metadata: { maxClients: n } });
}

/**
 * Super-admin: the ONE "suspend/reactivate this coach" action — sets BOTH
 * the coach's plan status (`CoachPlanDoc.status`, what `coachPlanState()`/the
 * admin list's Pill reads) AND their actual account status
 * (`UserDoc.accountStatus`, what actually blocks login) together, so the two
 * can never drift out of sync regardless of which admin screen triggered it —
 * `AdminCoaches.tsx`'s row action and `AdminCoachDetail.tsx`'s own button
 * both call this.
 */
export async function setCoachSuspended(coachId: string, suspended: boolean): Promise<void> {
  const status = suspended ? 'suspended' : 'active';
  await Promise.all([
    trpc.coachPlans.adminUpdate.mutate({ coachId, status }),
    trpc.adminUsers.setStatus.mutate({ id: coachId, status }),
  ]);
  await writeAudit({ action: 'coachPlan.setStatus', targetUserId: coachId, metadata: { status } });
}

/** Super-admin: set (or clear, passing `null`) an explicit plan end date. */
export async function setCoachPlanEndsAt(coachId: string, endsAt: number | null): Promise<void> {
  await trpc.coachPlans.adminUpdate.mutate({ coachId, endsAt });
  await writeAudit({ action: 'coachPlan.setEndsAt', targetUserId: coachId, metadata: { endsAt } });
}

/** Effective coach-plan status, folding the trial end date in. */
export function coachPlanState(plan: CoachPlan | null, now = Date.now()): 'trial' | 'active' | 'expired' | 'suspended' | 'none' {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  // A lapsed end date expires ANY tier (trial OR paid) — previously only trials
  // were folded in, so paid coaches past their date stayed "active" forever.
  if (plan.endsAt != null && now >= plan.endsAt) return 'expired';
  if (plan.status !== 'active') return 'expired';
  return plan.plan === 'trial' ? 'trial' : 'active';
}
