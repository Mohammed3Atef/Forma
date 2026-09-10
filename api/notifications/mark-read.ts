import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { requireUser } from '../_lib/withAuth.js';
import { feedFilter, notificationsCol } from './_data.js';

const Body = z.object({
  /** Mark just this one notification read; omit to mark the caller's whole feed read. */
  id: z.string().trim().min(1).optional(),
});

/**
 * POST /api/notifications/mark-read { id? }
 *   Marks one notification (by id, scoped to the caller's own feed — mirrors
 *   `markNotificationSeen`) or, with no `id`, every unread notification in the
 *   caller's feed (mirrors `markMessageNotificationsSeen`'s "clear them all on
 *   open" behavior, generalized to the whole feed) as seen.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    const { id } = Body.parse(req.body);

    const base = await feedFilter(user);
    if (!base) {
      res.status(200).json({ ok: true, updated: 0 });
      return;
    }

    const col = await notificationsCol();
    const now = Date.now();

    if (id) {
      const result = await col.updateOne({ _id: id, ...base }, { $set: { seenAt: now, updatedAt: now } });
      if (result.matchedCount === 0) throw new HttpError(404, 'Notification not found');
      res.status(200).json({ ok: true, updated: result.modifiedCount });
      return;
    }

    const result = await col.updateMany({ ...base, seenAt: null }, { $set: { seenAt: now, updatedAt: now } });
    res.status(200).json({ ok: true, updated: result.modifiedCount });
  } catch (e) {
    handleError(res, e);
  }
}
