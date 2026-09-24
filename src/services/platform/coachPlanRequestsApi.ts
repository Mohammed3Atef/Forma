import { trpc, TRPCClientError } from '@/services/trpc';
import { useSession } from '@/services/auth/sessionStore';
import { writeAudit } from './auditApi';
import type { CoachPlanRequest } from '@/types';

/**
 * Plan-REQUEST lifecycle — replaces the old `coachPlanChangeRequests`
 * singleton. A coach's real entitlements never come from here (see
 * `coachPlanApi.ts`'s `CoachPlan`) — this only tracks a pending paid-plan
 * selection until a super-admin manually confirms payment.
 */

/** The signed-in coach's current actionable request, or their most recent resolved one. Null if they've never requested a paid plan. */
export async function getMyPlanRequest(): Promise<CoachPlanRequest | null> {
  return trpc.coachPlanRequests.get.query();
}

/** Coach submits (or replaces) a request for a paid tier. Auto-cancels any prior awaiting request. */
export async function submitPlanRequest(tierKey: string, reason?: string): Promise<CoachPlanRequest> {
  const result = await trpc.coachPlanRequests.submit.mutate({ tierKey, reason });
  const uid = useSession.getState().uid;
  if (uid) await writeAudit({ action: 'coachPlanRequest.submitted', targetUserId: uid, metadata: { tierKey } });
  return result;
}

/** Coach withdraws their own still-actionable request. */
export async function cancelPlanRequest(): Promise<CoachPlanRequest> {
  const result = await trpc.coachPlanRequests.cancel.mutate();
  const uid = useSession.getState().uid;
  if (uid) await writeAudit({ action: 'coachPlanRequest.cancelled', targetUserId: uid });
  return result;
}

/** Super-admin: every actionable (awaiting/processing) request, across all coaches. */
export async function listPendingPlanRequests(): Promise<CoachPlanRequest[]> {
  return trpc.coachPlanRequests.listPending.query();
}

/** Super-admin confirms payment — atomically activates the coach's requested plan from now. */
export async function confirmPlanRequest(requestId: string): Promise<CoachPlanRequest> {
  const result = await trpc.coachPlanRequests.confirm.mutate({ requestId });
  await writeAudit({ action: 'coachPlanRequest.confirmed', targetUserId: result.coachId, metadata: { requestId } });
  return result;
}

/** Super-admin rejects a request. The coach's actual plan is never touched. */
export async function rejectPlanRequest(requestId: string, adminNote?: string): Promise<CoachPlanRequest> {
  const result = await trpc.coachPlanRequests.reject.mutate({ requestId, adminNote });
  await writeAudit({ action: 'coachPlanRequest.rejected', targetUserId: result.coachId, metadata: { requestId, adminNote } });
  return result;
}

export function isTRPCConflict(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'CONFLICT';
}
