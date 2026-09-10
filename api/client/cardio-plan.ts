import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from './_lib/access.js';
import { clientCardioPlansCol } from './_lib/db.js';

/**
 * Port of `planApi.getClientCardioPlan/saveClientCardioPlan` — the coach-
 * authored singleton at Firestore's `clientData/{clientId}/plan/cardio`.
 * `plan` is in `isCoachOwnedColl`: client read-only, coach/admin(clients.writeAll) write.
 */
const Body = z
  .object({ id: z.string().optional(), name: z.string().trim().min(1) })
  .passthrough();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await clientCardioPlansCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      if (!doc) {
        res.status(200).json(null);
        return;
      }
      const plan: Record<string, unknown> = { ...doc };
      delete plan._id;
      delete plan.clientId;
      res.status(200).json(plan);
      return;
    }

    // PUT — full replace, mirrors `setDoc` (not merge).
    if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
    const body = Body.parse(req.body);
    const now = Date.now();
    const plan = { ...body, id: body.id ?? clientId, updatedAt: now };
    await col.replaceOne({ _id: clientId }, { _id: clientId, clientId, ...plan }, { upsert: true });
    res.status(200).json(plan);
  } catch (e) {
    handleError(res, e);
  }
}
