import { trpc, TRPCClientError } from "@/services/trpc";
import type { CoachPlan, CoachPlanState } from "@/types";

/**
 * The coach's own Forma subscription (`coachPlans.*`). One product: the Free
 * Trial, then the monthly subscription — there are no tiers to choose or
 * change. Requests live in `coachPlanRequestsApi.ts`; capacity add-ons and
 * Super Admin renew/grant actions in `coachCommercialApi.ts`. Every Super
 * Admin mutation is audited server-side in the same transaction.
 */

const DAY_MS = 86_400_000;

/**
 * Reads the signed-in coach's own plan via `coachPlans.me`. A super admin
 * viewing another coach falls back to `adminCoaches.detail`.
 */
export async function getCoachPlan(coachId: string): Promise<CoachPlan | null> {
  try {
    return await trpc.coachPlans.me.query();
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === "NOT_FOUND") return null;
    if (!(e instanceof TRPCClientError) || e.data?.code !== "FORBIDDEN") throw e;
  }
  try {
    const detail = await trpc.adminCoaches.detail.query({ id: coachId });
    return (detail.plan as CoachPlan | null) ?? null;
  } catch (e) {
    if (e instanceof TRPCClientError && (e.data?.code === "NOT_FOUND" || e.data?.code === "FORBIDDEN")) return null;
    throw e;
  }
}

/** Idempotent Trial bootstrap (`auth.signup` already does this server-side). */
export async function createTrialPlan(coachId: string): Promise<CoachPlan> {
  void coachId; // resolved from the auth token server-side
  return trpc.coachPlans.createTrial.mutate();
}

/** Trial-reminder bookkeeping — deliberately a no-op (no self-service route persists it); callers treat it as best-effort. */
export async function markTrialNotified(coachId: string, key: "d7" | "d5" | "d3" | "d1"): Promise<void> {
  void coachId;
  void key;
}

/** The server maintains `activeClientCount` itself; kept as a no-op for existing callers. */
export async function bumpActiveClientCount(coachId: string, delta: number): Promise<void> {
  void coachId;
  void delta;
}

/** Days remaining on the current Trial / term (rounded up), or null when it has no end. */
export function trialDaysLeft(plan: Pick<CoachPlan, "endsAt">, now = Date.now()): number | null {
  if (plan.endsAt == null) return null;
  return Math.ceil((plan.endsAt - now) / DAY_MS);
}

/** Effective state with the end date folded in (mirrors the server's `planStateOf`). */
export function coachPlanState(plan: Pick<CoachPlan, "plan" | "status" | "endsAt"> | null, now = Date.now()): CoachPlanState {
  if (!plan) return "none";
  if (plan.status === "suspended") return "suspended";
  if (plan.endsAt != null && now >= plan.endsAt) return "expired";
  if (plan.status !== "active") return "expired";
  return plan.plan === "trial" ? "trial" : "active";
}

/** Capacity usage for display: used / limit, and how far over it is (never negative). */
export function capacityOf(plan: Pick<CoachPlan, "maxClients" | "activeClientCount"> | null | undefined) {
  const limit = plan?.maxClients ?? 0;
  const used = plan?.activeClientCount ?? 0;
  return { used, limit, over: Math.max(0, used - limit), full: used >= limit, remaining: Math.max(0, limit - used) };
}

/**
 * Super-admin: suspend / reactivate — sets BOTH the plan status and the
 * account status together so the two never drift.
 */
export async function setCoachSuspended(coachId: string, suspended: boolean): Promise<void> {
  const status = suspended ? "suspended" : "active";
  await Promise.all([
    trpc.coachPlans.adminUpdate.mutate({ coachId, status }),
    trpc.adminUsers.setStatus.mutate({ id: coachId, status }),
  ]);
}

/** Super-admin: extend the current Trial / term by N days from max(now, current end); re-opens a lapsed term. */
export async function extendCoachTerm(coachId: string, days: number, currentEndsAt: number | null): Promise<void> {
  const from = Math.max(Date.now(), currentEndsAt ?? Date.now());
  await trpc.coachPlans.adminUpdate.mutate({ coachId, endsAt: from + Math.max(1, Math.floor(days)) * DAY_MS, reason: `extend ${days}d` });
}

/** Super-admin: set (or clear, passing `null`) an explicit end date. */
export async function setCoachPlanEndsAt(coachId: string, endsAt: number | null): Promise<void> {
  await trpc.coachPlans.adminUpdate.mutate({ coachId, endsAt });
}
