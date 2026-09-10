import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActive, requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { activeDaysCol, dayKey } from './usage-lib.js';

/**
 * Port of `usageApi.ts`'s `recordActiveDay()` — records that the calling
 * signed-in user was active today (idempotent per user/day). Per
 * firestore.rules' `activeDays` create/update rule, a user may only ever
 * record THEIR OWN presence — uid/role come from the verified session, never
 * the request body.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    requireActive(user);

    const day = dayKey();
    const col = await activeDaysCol();
    await col.updateOne(
      { _id: `${day}__${user.id}` },
      { $set: { day, uid: user.id, role: user.role, ts: Date.now() } },
      { upsert: true },
    );
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
