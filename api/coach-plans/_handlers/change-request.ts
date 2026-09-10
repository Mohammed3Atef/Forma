import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireRole, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { coachPlanChangeRequestsCol, toPublicChangeRequest, type CoachPlanChangeRequestDoc } from '../_data.js';

/** Mirrors `submitPlanChangeRequest`'s accepted body shape. */
const Body = z.object({
  requestedTier: z.string().trim().min(1).max(60).optional(),
  requestedMaxClients: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(2000),
});

/**
 * POST/DELETE /api/coach-plans/change-request
 *  - POST — coach requests a tier/cap change. Upserts the singleton
 *    `coachPlanChangeRequests` doc (was `coachPlans/{coachId}/planChangeRequest/current`),
 *    always resetting it back to 'pending' (a re-submission overwrites a prior
 *    cancelled/resolved one).
 *  - DELETE — coach withdraws their OWN still-pending request. Only the coach
 *    who owns the request may cancel it, and only while it's still 'pending'
 *    (mirrors the admin accept/reject path in `admin-plan-change-requests.ts`,
 *    but scoped to `user.id` rather than an arbitrary `coachId`).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST', 'DELETE');
    const user = await requireUser(req);
    requireRole(user, 'coach');
    const reqs = await coachPlanChangeRequestsCol();

    if (req.method === 'DELETE') {
      const existing = await reqs.findOne({ _id: user.id });
      if (!existing) throw new HttpError(404, 'No plan-change request found.');
      if (existing.status !== 'pending') {
        throw new HttpError(409, 'This request has already been resolved and can no longer be cancelled.');
      }
      const now = Date.now();
      await reqs.updateOne(
        { _id: user.id },
        { $set: { status: 'cancelled', reviewedAt: now, reviewedBy: user.id, updatedAt: now } },
      );
      const updated = await reqs.findOne({ _id: user.id });
      res.status(200).json(toPublicChangeRequest(updated!));
      return;
    }

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
    await reqs.replaceOne({ _id: user.id }, doc, { upsert: true });
    res.status(200).json(toPublicChangeRequest(doc));
  } catch (e) {
    handleError(res, e);
  }
}
