import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireRole, requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { coachPlanChangeRequestsCol, toPublicChangeRequest, type CoachPlanChangeRequestDoc } from './_data.js';

/** Mirrors `submitPlanChangeRequest`'s accepted body shape. */
const Body = z.object({
  requestedTier: z.string().trim().min(1).max(60).optional(),
  requestedMaxClients: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/coach-plans/change-request — coach requests a tier/cap change.
 * Upserts the singleton `coachPlanChangeRequests` doc (was
 * `coachPlans/{coachId}/planChangeRequest/current`), always resetting it back
 * to 'pending' (a re-submission overwrites a prior cancelled/resolved one).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    requireRole(user, 'coach');
    const body = Body.parse(req.body);
    const now = Date.now();
    const doc: CoachPlanChangeRequestDoc = {
      _id: user.id,
      coachId: user.id,
      reason: body.reason,
      status: 'pending',
      requestedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: now,
      ...(body.requestedTier ? { requestedTier: body.requestedTier } : {}),
      ...(body.requestedMaxClients ? { requestedMaxClients: Math.max(0, Math.floor(body.requestedMaxClients)) } : {}),
    };
    const reqs = await coachPlanChangeRequestsCol();
    await reqs.replaceOne({ _id: user.id }, doc, { upsert: true });
    res.status(200).json(toPublicChangeRequest(doc));
  } catch (e) {
    handleError(res, e);
  }
}
