import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../_lib/withAuth';
import { hasPermission } from '../_lib/rbac';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { transferClientWithMode } from '../coach-clients/_service';
import { transfersCol } from './_data';

const PatchBody = z.object({
  action: z.enum(['cancel', 'accept', 'reject']),
  adminNote: z.string().trim().max(2000).optional(),
});

function idParam(raw: unknown): string {
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';
}

/**
 * `PATCH /api/transfers/:id` (`:id` == `${toCoachId}__${clientId}`) — resolves
 * a pending takeover request. Port of `resolveTransferRequest()` +
 * `cancelTransferRequest()`:
 *  - `{ action: 'cancel' }` : the requesting coach (`toCoachId`) withdraws
 *    their own pending request.
 *  - `{ action: 'accept' }`: the CURRENT coach (`fromCoachId`) or an admin
 *    (`coaches.assign`) approves — this is the only path that actually moves
 *    the client, via the shared `transferClientWithMode()` (same function a
 *    direct admin transfer through `api/coach-clients/:id` uses).
 *  - `{ action: 'reject' }`: same permission as accept, but only records the
 *    decision — no reassignment.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const user = await requireUser(req);
    const id = idParam(req.query.id);
    if (!id) throw new HttpError(400, 'Transfer request id is required');

    const col = await transfersCol();
    const reqDoc = await col.findOne({ _id: id });
    if (!reqDoc) throw new HttpError(404, 'Transfer request not found');
    if (reqDoc.status !== 'pending') throw new HttpError(409, 'This request has already been resolved');

    // Mutating action: caller must be active.
    requireActive(user);
    const body = PatchBody.parse(req.body);
    const now = Date.now();
    const canAssign = hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign');

    if (body.action === 'cancel') {
      if (user.id !== reqDoc.toCoachId) throw new HttpError(403, 'Forbidden');
      await col.updateOne({ _id: id }, { $set: { status: 'cancelled', updatedAt: now } });
      res.status(200).json({ ...reqDoc, status: 'cancelled', updatedAt: now });
      return;
    }

    // accept / reject
    if (user.id !== reqDoc.fromCoachId && !canAssign) throw new HttpError(403, 'Forbidden');
    const outcome = body.action === 'accept' ? 'accepted' : 'rejected';

    if (outcome === 'accepted') {
      // The actual reassignment goes through the shared coach-clients service,
      // exactly like the Firestore-era comment says ("the caller then performs
      // the actual release/transfer through coachClientsApi").
      await transferClientWithMode(
        reqDoc.clientId,
        reqDoc.fromCoachId,
        reqDoc.toCoachId,
        reqDoc.mode ?? 'keep_plans',
        reqDoc.subscriptionHandling ?? 'keep',
        user.id,
      );
    }

    await col.updateOne(
      { _id: id },
      {
        $set: {
          status: outcome,
          reviewedAt: now,
          reviewedBy: user.id,
          updatedAt: now,
          ...(body.adminNote ? { adminNote: body.adminNote } : {}),
        },
      },
    );
    res.status(200).json({ ...reqDoc, status: outcome, reviewedAt: now, reviewedBy: user.id, updatedAt: now });
  } catch (e) {
    handleError(res, e);
  }
}
