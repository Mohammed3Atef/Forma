import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from './_lib/access.js';
import { coachTargetsCol } from './_lib/db.js';
import { notify } from './_lib/notify.js';
import type { CoachTargetsDoc } from './_lib/types.js';

/**
 * Port of `coachApi.getCoachTargets/setCoachTargets` — the singleton
 * `clientData/{clientId}/coachTargets/current`. `coachTargets` is in
 * `isCoachOwnedColl`: client read-only, only the assigned coach /
 * admin(clients.writeAll) may write.
 */
const Body = z.object({
  waterMl: z.number().optional(),
  steps: z.number().optional(),
  cardioMin: z.number().optional(),
  calories: z.number().optional(),
  protein: z.number().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await coachTargetsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      res.status(200).json(doc ?? null);
      return;
    }

    // PUT
    if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
    const body = Body.parse(req.body);
    const now = Date.now();
    const clean: CoachTargetsDoc = { _id: clientId, clientId, updatedBy: user.id, updatedAt: now };
    for (const k of ['waterMl', 'steps', 'cardioMin', 'calories', 'protein'] as const) {
      const v = body[k];
      if (typeof v === 'number' && !Number.isNaN(v)) clean[k] = v;
    }
    await col.replaceOne({ _id: clientId }, clean, { upsert: true });
    await notify({ clientId, forRole: 'client', type: 'targets_updated', screen: 'nutrition', route: '/nutrition', createdBy: user.id });
    res.status(200).json(clean);
  } catch (e) {
    handleError(res, e);
  }
}
