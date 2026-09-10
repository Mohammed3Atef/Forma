import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { canReadClientData, isActiveSelf, resolveClientId } from './_lib/access';
import { clientSettingsCol } from './_lib/db';

/**
 * `clientSettings` — fully client-owned app settings (Firestore's
 * `clientData/{clientId}/settings/app`). Not in `isCoachOwnedColl` and not
 * covered by any dedicated coach-write rule, so only the client themself may
 * write it; the assigned coach / admin(readAll) may only read.
 */
const Body = z.record(z.string(), z.unknown());

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await clientSettingsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      res.status(200).json(doc?.settings ?? null);
      return;
    }

    // PUT
    if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
    const settings = Body.parse(req.body);
    const now = Date.now();
    await col.updateOne({ _id: clientId }, { $set: { clientId, settings, updatedAt: now } }, { upsert: true });
    const updated = await col.findOne({ _id: clientId });
    res.status(200).json(updated?.settings ?? null);
  } catch (e) {
    handleError(res, e);
  }
}
