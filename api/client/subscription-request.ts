import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from './_lib/access';
import { subscriptionRequestsCol } from './_lib/db';
import { notify } from './_lib/notify';
import type { FreezeRequestDoc } from './_lib/types';

/**
 * Port of `clientCoachApi.fetchMyFreezeRequest/submitFreezeRequest/cancelFreezeRequest`
 * and `coachApi.getClientFreezeRequest/resolveFreezeRequest` — the singleton
 * `clientData/{clientId}/subscriptionRequest/current`. NOT coach-owned: the
 * client creates/cancels via the generic own-write rule; the assigned coach /
 * admin(clients.writeAll) decides via the dedicated rule.
 */
const SubmitBody = z.object({
  from: z.number().nullable().optional(),
  until: z.number().nullable().optional(),
  reason: z.string().trim().min(1),
});

const DecideBody = z.object({
  outcome: z.enum(['accepted', 'rejected']),
  coachNote: z.string(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST', 'PATCH');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await subscriptionRequestsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      res.status(200).json(doc ?? null);
      return;
    }

    if (req.method === 'POST') {
      const action = typeof req.query.action === 'string' ? req.query.action : 'submit';

      if (action === 'decide') {
        if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
        const body = DecideBody.parse(req.body);
        const now = Date.now();
        await col.updateOne(
          { _id: clientId },
          { $set: { clientId, status: body.outcome, decidedAt: now, decidedBy: user.id, coachNote: body.coachNote.trim(), updatedAt: now } },
          { upsert: true },
        );
        const updated = await col.findOne({ _id: clientId });
        await notify({
          clientId,
          forRole: 'client',
          type: 'freeze_decided',
          body: body.coachNote.trim().slice(0, 140),
          route: '/coach-notes',
          createdBy: user.id,
        });
        res.status(200).json(updated);
        return;
      }

      // action === 'submit' (default) — client creates/resubmits.
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const body = SubmitBody.parse(req.body);
      const now = Date.now();
      const doc: FreezeRequestDoc = {
        _id: clientId,
        clientId,
        from: body.from ?? null,
        until: body.until ?? null,
        reason: body.reason.trim(),
        status: 'pending',
        requestedAt: now,
        decidedAt: null,
        decidedBy: null,
        coachNote: '',
        updatedAt: now,
      };
      await col.replaceOne({ _id: clientId }, doc, { upsert: true });
      await notify({
        clientId,
        forRole: 'coach',
        type: 'freeze_requested',
        body: body.reason.trim().slice(0, 140),
        route: `/coach/client/${clientId}`,
        createdBy: clientId,
      });
      res.status(201).json(doc);
      return;
    }

    // PATCH — client withdraws a pending request.
    if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
    const now = Date.now();
    await col.updateOne({ _id: clientId }, { $set: { status: 'cancelled', updatedAt: now } });
    const updated = await col.findOne({ _id: clientId });
    if (!updated) throw new HttpError(404, 'Subscription request not found');
    res.status(200).json(updated);
  } catch (e) {
    handleError(res, e);
  }
}
