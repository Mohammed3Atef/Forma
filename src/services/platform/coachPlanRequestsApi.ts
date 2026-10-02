import { trpc, TRPCClientError } from '@/services/trpc';
import type { AdminPlanRequestRow, CoachPlanRequest, PlanRequestStatus, PlanRequestType } from '@/types';

/**
 * Forma request lifecycle: the coach files a subscription / renewal /
 * capacity add-on request with an immutable snapshot, pays offline, and a
 * Super Admin confirms. Entitlements never come from a request. Audit rows
 * are written server-side in the same transaction as each state change.
 */

/** The signed-in coach's own requests, newest first. */
export async function getMyPlanRequests(): Promise<CoachPlanRequest[]> {
  return trpc.coachPlanRequests.mine.query();
}

/** Coach asks to start (or renew) the Forma subscription — snapshot of today's price/term. */
export async function submitSubscriptionRequest(reason?: string): Promise<CoachPlanRequest> {
  return trpc.coachPlanRequests.submitSubscription.mutate(reason ? { reason } : undefined);
}

/** Coach asks for a capacity package. */
export async function submitCapacityRequest(packageId: string): Promise<CoachPlanRequest> {
  return trpc.coachPlanRequests.submitCapacity.mutate({ packageId });
}

/** Coach withdraws one of their own awaiting requests. */
export async function cancelPlanRequest(id: string): Promise<CoachPlanRequest> {
  return trpc.coachPlanRequests.cancel.mutate({ id });
}

/** Super-admin: the Payment Requests queue (default: actionable only). */
export async function listPlanRequests(filter?: { statuses?: PlanRequestStatus[]; types?: PlanRequestType[]; coachId?: string; limit?: number }): Promise<AdminPlanRequestRow[]> {
  return trpc.coachPlanRequests.list.query(filter);
}

/** Super-admin: actionable requests (badges / dashboard counts). */
export async function listPendingPlanRequests(): Promise<CoachPlanRequest[]> {
  return trpc.coachPlanRequests.listPending.query();
}

/** Super-admin confirms payment — applies the snapshot atomically. */
export async function confirmPlanRequest(requestId: string, adminNote?: string): Promise<CoachPlanRequest> {
  return trpc.coachPlanRequests.confirm.mutate({ requestId, adminNote });
}

/** Super-admin rejects. Entitlements are never touched. */
export async function rejectPlanRequest(requestId: string, adminNote?: string): Promise<CoachPlanRequest> {
  return trpc.coachPlanRequests.reject.mutate({ requestId, adminNote });
}

export function isTRPCConflict(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'CONFLICT';
}

/** Machine reason on a commercial refusal (`SUBSCRIPTION_EXPIRED`, `CLIENT_CAPACITY_REACHED`, …), if any. */
export function commercialReason(e: unknown): string | null {
  if (!(e instanceof TRPCClientError)) return null;
  const data = e.data as { reason?: unknown } | undefined;
  return typeof data?.reason === 'string' ? data.reason : null;
}

/** True for a subscription-type request (vs a capacity add-on). */
export const isSubscriptionRequest = (r: Pick<CoachPlanRequest, 'type'>) => r.type !== 'capacity_addon';
/** Awaiting / processing. */
export const isActionable = (r: Pick<CoachPlanRequest, 'status'>) => r.status === 'awaiting' || r.status === 'processing';
/** Raised by the cron at Trial end — stays open until resolved, so it has no meaningful deadline. */
export const hasDeadline = (r: Pick<CoachPlanRequest, 'type'>) => r.type !== 'trial_expired';
