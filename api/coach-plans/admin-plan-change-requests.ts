import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requirePermission, requireUser } from '../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import {
  DAY_MS,
  PAID_TERM_DAYS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_CLIENTS,
  coachPlanChangeRequestsCol,
  coachPlansCol,
  toPublicChangeRequest,
  type PlanHistoryEntry,
} from './_data';
import { COACH_PLAN_TIERS, getTier } from '../plan-tiers/_data';

/**
 * GET/PATCH/DELETE /api/coach-plans/admin-plan-change-requests
 *
 * NOTE ON PATH: the task spec named this route `/api/admin/plan-change-requests`,
 * but ground rule #1 for this module restricts new files to `api/coach-plans/`
 * and `api/plan-tiers/` only (to avoid colliding with a parallel agent that may
 * own `api/admin/`). Since this route operates purely on the `coachPlanChangeRequests`
 * collection, it's placed here instead: `api/coach-plans/admin-plan-change-requests.ts`
 * → `/api/coach-plans/admin-plan-change-requests`. Flagged for the integrator.
 *
 * Mirrors `listPendingPlanChangeRequests` (GET, was a `collectionGroup` query —
 * here just a direct query on the flattened top-level collection) and
 * `resolvePlanChangeRequest` (PATCH). DELETE clears/removes a request doc
 * outright (e.g. after it's been actioned, or to dismiss a stale one).
 *
 * Every method requires `users.manageStatus`, matching firestore.rules' gate
 * on plan-change-request resolution (and, per the task spec, on listing too).
 */

const PatchBody = z.object({
  coachId: z.string().trim().min(1),
  decision: z.enum(['accepted', 'rejected']),
  adminNote: z.string().trim().max(2000).optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PATCH', 'DELETE');
    const user = await requireUser(req);
    requirePermission(user, 'users.manageStatus');
    const reqsCol = await coachPlanChangeRequestsCol();

    if (req.method === 'GET') {
      const pending = await reqsCol.find({ status: 'pending' }).toArray();
      res.status(200).json(pending.map(toPublicChangeRequest));
      return;
    }

    if (req.method === 'PATCH') {
      const body = PatchBody.parse(req.body);
      const existing = await reqsCol.findOne({ _id: body.coachId });
      if (!existing) throw new HttpError(404, 'No plan-change request found for this coach.');
      const now = Date.now();
      const adminNote = (body.adminNote ?? '').trim();

      if (body.decision === 'accepted') {
        const plansCol = await coachPlansCol();
        const plan = await plansCol.findOne({ _id: body.coachId });
        const tier = existing.requestedTier;
        let maxClients = existing.requestedMaxClients ?? plan?.maxClients ?? TRIAL_MAX_CLIENTS;
        if (existing.requestedMaxClients === undefined && tier) {
          const tierCfg = await getTier(tier);
          maxClients = tierCfg?.maxClients ?? COACH_PLAN_TIERS[tier]?.maxClients ?? maxClients;
        }
        const historyEntry: PlanHistoryEntry = {
          at: now,
          action: 'request.accepted',
          detail: adminNote.slice(0, 120),
          by: user.id,
        };
        await plansCol.updateOne(
          { _id: body.coachId },
          {
            $set: {
              ...(tier ? { plan: tier } : {}),
              maxClients,
              status: 'active',
              endsAt: now + (tier === 'trial' ? TRIAL_DURATION_DAYS : PAID_TERM_DAYS) * DAY_MS,
              updatedAt: now,
            },
            $push: { history: historyEntry },
          },
        );
      } else {
        const historyEntry: PlanHistoryEntry = {
          at: now,
          action: 'request.rejected',
          detail: adminNote.slice(0, 120),
          by: user.id,
        };
        // Best-effort — a coach without a plan doc shouldn't block the resolution.
        await (await coachPlansCol())
          .updateOne({ _id: body.coachId }, { $set: { updatedAt: now }, $push: { history: historyEntry } })
          .catch(() => undefined);
      }

      await reqsCol.updateOne(
        { _id: body.coachId },
        { $set: { status: body.decision, reviewedAt: now, reviewedBy: user.id, adminNote, updatedAt: now } },
      );
      const updated = await reqsCol.findOne({ _id: body.coachId });
      res.status(200).json(toPublicChangeRequest(updated!));
      return;
    }

    // DELETE — clear/dismiss a coach's plan-change request doc outright.
    const coachId = String(req.query.coachId ?? '').trim();
    if (!coachId) throw new HttpError(400, 'Missing coachId.');
    await reqsCol.deleteOne({ _id: coachId });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
