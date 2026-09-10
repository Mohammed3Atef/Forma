import { apiGet, apiPatch, apiPost, ApiError } from '@/services/platformApi';
import { writeAudit } from './auditApi';
import { notify } from './notificationsApi';
import type { CoachPlan, CoachPlanChangeRequest } from '@/types';

/**
 * Layer A — the coach's own subscription to Forma, backed by the Mongo
 * `coachPlans` collection via `/api/coach-plans/*` (was Firestore
 * `coachPlans/{coachId}`). Distinct from the per-client `Subscription`
 * (Layer B) on `coachClients`.
 *
 * A coach self-creates a trial on signup via `POST /coach-plans/trial`
 * (idempotent server-side — never downgrades an existing plan). Super-admin
 * overrides (tier/status/maxClients) go through `PATCH /coach-plans/:coachId`.
 */

/** Trial defaults — mirrored server-side in `api/coach-plans/_data.ts`. Keep the two in sync. */
export const TRIAL_MAX_CLIENTS = 10;
export const TRIAL_DURATION_DAYS = 15;
/** Default renewal cycle for paid tiers (renewals are manual — no payment gateway). */
export const PAID_TERM_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Reads the signed-in coach's own plan via `GET /coach-plans/me`. For a
 * non-coach caller (a super-admin viewing another coach's plan from
 * `AdminCoachDetail.tsx`), `/coach-plans/me` 403s (there is no dedicated
 * "read any coach's plan" route under `api/coach-plans/`), so this falls back
 * to the admin coach-detail endpoint (`api/admin/coaches/[id].ts`), which
 * embeds the same doc shape under `.plan`.
 */
export async function getCoachPlan(coachId: string): Promise<CoachPlan | null> {
  try {
    return await apiGet<CoachPlan>('/coach-plans/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    if (!(e instanceof ApiError) || e.status !== 403) throw e;
  }
  try {
    const detail = await apiGet<{ plan: (CoachPlan & { _id?: string }) | null }>(
      `/admin/coaches/${encodeURIComponent(coachId)}`,
    );
    return detail.plan;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/**
 * Creates the coach's auto trial plan. `POST /coach-plans/trial` is idempotent
 * server-side: if a plan already exists (of any tier, even upgraded/paid) it
 * is returned untouched. Called at coach signup from the session sign-in path.
 */
export async function createTrialPlan(coachId: string): Promise<CoachPlan> {
  void coachId; // the backend resolves the coach from the auth token, not a client-supplied id
  return apiPost<CoachPlan>('/coach-plans/trial');
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

/** Super-admin: list every coach plan, via the aggregate `GET /admin/coaches` (embeds each coach's plan). */
export async function listAllCoachPlans(): Promise<CoachPlan[]> {
  const data = await apiGet<{ rows: Array<{ plan: (CoachPlan & { _id?: string }) | null }> }>('/admin/coaches');
  return data.rows.map((r) => r.plan).filter((p): p is CoachPlan => p !== null);
}

/** Super-admin: upgrade/downgrade a coach to a tier (sets the cap + activates). */
export async function setCoachTier(coachId: string, tier: CoachTierKey): Promise<void> {
  await apiPatch(`/coach-plans/${encodeURIComponent(coachId)}`, { tier });
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
  await apiPatch(`/coach-plans/${encodeURIComponent(coachId)}`, { tier: plan?.plan ?? 'trial' });
  await writeAudit({ action: 'coachPlan.extend', targetUserId: coachId, metadata: { days } });
}

/** Super-admin: renew a coach's term (default a full paid cycle) and (re)activate. See `extendCoachTrial` for the same day-offset caveat. */
export async function renewCoachPlan(coachId: string, days = PAID_TERM_DAYS): Promise<void> {
  const plan = await getCoachPlan(coachId);
  await apiPatch(`/coach-plans/${encodeURIComponent(coachId)}`, { tier: plan?.plan ?? 'trial' });
  await writeAudit({ action: 'coachPlan.renew', targetUserId: coachId, metadata: { days } });
}

/** Super-admin: adjust a coach's client cap directly. */
export async function setCoachMaxClients(coachId: string, maxClients: number): Promise<void> {
  const n = Math.max(0, Math.floor(maxClients));
  await apiPatch(`/coach-plans/${encodeURIComponent(coachId)}`, { maxClients: n });
  await writeAudit({ action: 'coachPlan.setMaxClients', targetUserId: coachId, metadata: { maxClients: n } });
}

/** Super-admin: suspend/reactivate a coach PLAN (separate from the account). */
export async function setCoachPlanStatus(coachId: string, status: 'active' | 'suspended'): Promise<void> {
  await apiPatch(`/coach-plans/${encodeURIComponent(coachId)}`, { status });
  await writeAudit({ action: 'coachPlan.setStatus', targetUserId: coachId, metadata: { status } });
}

/**
 * Super-admin: set (or clear) an explicit plan end date.
 *
 * NOTE: `PATCH /coach-plans/:coachId`'s body has no `endsAt` field at all (only
 * tier/status/maxClients), so there is currently no route that can apply an
 * arbitrary custom end date. Throwing here rather than silently ignoring the
 * admin's chosen date.
 */
export async function setCoachPlanEndsAt(coachId: string, endsAt: number | null): Promise<void> {
  void coachId;
  void endsAt;
  throw new Error('Setting a custom plan end date is not supported by the current API.');
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

// ---- Coach plan-change requests (coach → super-admin) ----------------------
// Mirrors the client→coach FreezeRequest. Singleton per coach, now the
// top-level Mongo collection `coachPlanChangeRequests` (`_id` == coachId).

/** Coach: submit (or re-submit) a plan-change / more-clients request. */
export async function submitPlanChangeRequest(
  coachId: string,
  data: { requestedTier?: CoachTierKey; requestedMaxClients?: number; reason: string },
): Promise<void> {
  void coachId; // the backend resolves the coach from the auth token
  await apiPost('/coach-plans/change-request', {
    reason: data.reason.trim(),
    ...(data.requestedTier ? { requestedTier: data.requestedTier } : {}),
    ...(data.requestedMaxClients ? { requestedMaxClients: Math.max(0, Math.floor(data.requestedMaxClients)) } : {}),
  });
}

/**
 * Read a coach's plan-change request (coach reads own; admin reads any).
 *
 * NOTE: the only read route is `GET /coach-plans/admin-plan-change-requests`
 * (`users.manageStatus`-gated, and only ever returns PENDING requests). A
 * coach calling it 403s — there is no self-service "read my own request"
 * route yet — so this degrades to `null` for a coach rather than throwing
 * (the request UI still works for submitting/seeing a pending request; it
 * just can't show a resolved accepted/rejected banner until that route
 * exists).
 */
export async function getCoachPlanChangeRequest(coachId: string): Promise<CoachPlanChangeRequest | null> {
  try {
    const pending = await apiGet<CoachPlanChangeRequest[]>('/coach-plans/admin-plan-change-requests');
    return pending.find((r) => r.coachId === coachId) ?? null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return null;
    throw e;
  }
}

/**
 * Coach: withdraw a pending request.
 *
 * NOTE: no route lets a coach self-cancel (only the admin accept/reject/delete
 * route exists, gated on `users.manageStatus`). Throwing here rather than
 * silently no-op-ing a click that appears to succeed.
 */
export async function cancelPlanChangeRequest(coachId: string): Promise<void> {
  void coachId;
  throw new Error('Cancelling a plan-change request is not supported by the current API.');
}

/** Super-admin: every pending plan-change request across all coaches. */
export async function listPendingPlanChangeRequests(): Promise<CoachPlanChangeRequest[]> {
  return apiGet<CoachPlanChangeRequest[]>('/coach-plans/admin-plan-change-requests');
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
  const note = adminNote.trim();
  await apiPatch('/coach-plans/admin-plan-change-requests', { coachId, decision: outcome, adminNote: note });
  // Notify the coach in their own bell that their request was reviewed. Best-effort.
  await notify({
    clientId: coachId,
    forRole: 'coach',
    type: 'plan_decided',
    body: note || undefined,
    route: '/coach/plan',
    createdBy: decidedBy,
  });
  await writeAudit({ action: `coachPlan.request.${outcome}`, targetUserId: coachId, metadata: { adminNote: note.slice(0, 140) } });
}
