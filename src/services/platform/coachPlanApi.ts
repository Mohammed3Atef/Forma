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
/** The ONE query definition for the coach's own plan (B0 / RM-84: was defined 4× with 60 s / 300 s staleTimes). */
export function coachPlanQuery(coachId: string | undefined) {
  return { queryKey: ['coachPlan', coachId] as const, queryFn: () => getCoachPlan(coachId!), enabled: !!coachId, staleTime: 60_000 };
}

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

/** Days remaining on the current Trial / term (rounded up), or null when it has no end. */
export function trialDaysLeft(plan: Pick<CoachPlan, "endsAt">, now = Date.now()): number | null {
  if (plan.endsAt == null) return null;
  return Math.ceil((plan.endsAt - now) / DAY_MS);
}

/**
 * Effective state: the server's `state` (computed at read time from `phase`, `status` and the end
 * date), with an end date that passed since that read folded in. B3.8 (owner D6): the coach UI never
 * reads the legacy tier field `plan.plan` — the server's `state` / `phase` are the only sources.
 */
export function coachPlanState(plan: Pick<CoachPlan, "state" | "endsAt"> | null, now = Date.now()): CoachPlanState {
  if (!plan) return "none";
  if ((plan.state === "trial" || plan.state === "active") && plan.endsAt != null && now >= plan.endsAt) return "expired";
  return plan.state;
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
