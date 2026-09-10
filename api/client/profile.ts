import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { canReadClientData, canWriteCoachOwned, isActiveSelf, resolveClientId } from './_lib/access';
import { clientProfilesCol } from './_lib/db';

/**
 * Port of `coachApi.fetchClientProfile` / `saveClientProfile` and
 * `clientCoachApi.fetchMyProfile` — the derived fitness profile at
 * Firestore's `clientData/{clientId}/profile/main`. Not coach-owned (`profile`
 * is excluded from `isCoachOwnedColl`), so BOTH the client (self, active) and
 * the assigned coach / admin(clients.writeAll) may write it; read is the
 * standard owner/coach/admin(readAll) rule.
 */
const Body = z.object({
  name: z.string().trim().min(1).max(200),
  age: z.number().min(0).max(150),
  weightKg: z.number().min(0),
  heightCm: z.number().min(0),
  goal: z.enum(['muscle_gain', 'fat_loss', 'recomp', 'maintenance', 'strength']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  locale: z.enum(['en', 'ar', 'ar-eg']),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await clientProfilesCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const doc = await col.findOne({ _id: clientId });
      res.status(200).json(doc?.profile ?? null);
      return;
    }

    // PUT
    const allowed = isActiveSelf(user, clientId) || (await canWriteCoachOwned(user, clientId));
    if (!allowed) throw new HttpError(403, 'Forbidden');
    const body = Body.parse(req.body);
    const now = Date.now();
    const existing = await col.findOne({ _id: clientId });
    await col.updateOne(
      { _id: clientId },
      {
        $set: {
          clientId,
          profile: { id: clientId, ...body, createdAt: existing?.profile?.createdAt ?? now, updatedAt: now },
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    const updated = await col.findOne({ _id: clientId });
    res.status(200).json(updated?.profile ?? null);
  } catch (e) {
    handleError(res, e);
  }
}
