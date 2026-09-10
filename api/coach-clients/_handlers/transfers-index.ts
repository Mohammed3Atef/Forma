import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../../_lib/withAuth.js';
import { hasPermission } from '../../_lib/rbac.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { transferReqId, transfersCol } from './transfers-data.js';
import type { ClientTransferRequestDoc } from './transfers-types.js';

const CreateBody = z.object({
  clientId: z.string().trim().min(1),
  fromCoachId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000),
  mode: z.enum(['fresh_start', 'keep_plans']).optional(),
  subscriptionHandling: z.enum(['keep', 'new', 'expire']).optional(),
});

const ListQuery = z.object({
  type: z.enum(['incoming', 'outgoing', 'pending']),
});

/**
 * `GET /api/transfers?type=incoming|outgoing|pending` — pull-based lists
 * (cross-coach pushes aren't permitted, same as the Firestore-era comment
 * explains): `incoming` = requests to take over MY clients (I'm
 * `fromCoachId`), `outgoing` = requests I've made (I'm `toCoachId`),
 * `pending` = every pending request platform-wide (admin oversight, requires
 * `coaches.assign`).
 *
 * `POST /api/transfers` — a prospective coach (`toCoachId` == self) requests a
 * client owned by another coach (`fromCoachId`). Port of
 * `submitTransferRequest()`. This module manages ONLY the request record —
 * the actual reassignment happens in `api/coach-clients/[id].ts`'s shared
 * `transferClientWithMode()`, invoked from `api/transfers/[id].ts` on accept.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    const col = await transfersCol();

    if (req.method === 'GET') {
      const q = ListQuery.parse(req.query);
      if (q.type === 'pending') {
        if (!hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign')) {
          throw new HttpError(403, 'Forbidden');
        }
        const list = await col.find({ status: 'pending' }).sort({ requestedAt: -1 }).toArray();
        res.status(200).json(list);
        return;
      }
      if (q.type === 'incoming') {
        const list = await col
          .find({ fromCoachId: user.id, status: 'pending' })
          .sort({ requestedAt: -1 })
          .toArray();
        res.status(200).json(list);
        return;
      }
      // 'outgoing'
      const list = await col.find({ toCoachId: user.id }).sort({ requestedAt: -1 }).toArray();
      res.status(200).json(list);
      return;
    }

    // POST — submit a takeover request. Only an ACTIVE coach may request
    // (never admin) — mirrors `isCoach()` in `firestore.rules`.
    if (user.role !== 'coach') throw new HttpError(403, 'Forbidden');
    requireActive(user);
    const body = CreateBody.parse(req.body);
    if (body.fromCoachId === user.id) throw new HttpError(400, 'You already coach this client');

    const id = transferReqId(user.id, body.clientId);
    const existing = await col.findOne({ _id: id });
    if (existing && existing.status === 'pending') {
      throw new HttpError(409, 'A pending request for this client already exists');
    }

    const now = Date.now();
    const req_: ClientTransferRequestDoc = {
      _id: id,
      clientId: body.clientId,
      fromCoachId: body.fromCoachId,
      toCoachId: user.id,
      reason: body.reason,
      status: 'pending',
      requestedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: now,
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.subscriptionHandling ? { subscriptionHandling: body.subscriptionHandling } : {}),
    };
    await col.updateOne({ _id: id }, { $set: req_ }, { upsert: true });
    res.status(201).json(req_);
  } catch (e) {
    handleError(res, e);
  }
}
