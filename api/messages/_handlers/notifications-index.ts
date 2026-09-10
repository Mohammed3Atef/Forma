import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { handleError, methodGuard } from '../../_lib/http.js';
import { requireUser } from '../../_lib/withAuth.js';
import { feedFilter, notificationsCol, toPublicNotification, type NotificationDoc } from './notifications-data.js';

const DEFAULT_PAGE_SIZE = 50;

const Query = z.object({
  since: z.coerce.number().optional(),
});

/**
 * GET /api/notifications?since=<ms epoch>
 *   Polling-friendly read of the caller's own notification feed (routed by
 *   role, see `feedFilter`), newest-first, plus a cheap `unreadCount` so a
 *   polling hook can drive a badge without re-fetching the full list every
 *   tick. `unreadCount` always reflects the WHOLE feed (ignores `since`); the
 *   `notifications` array is scoped to `since` when given, else the last
 *   `DEFAULT_PAGE_SIZE`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const { since } = Query.parse(req.query);

    const base = await feedFilter(user);
    if (!base) {
      res.status(200).json({ notifications: [], unreadCount: 0 });
      return;
    }

    const col = await notificationsCol();
    const listFilter = since != null ? { ...base, createdAt: { $gt: since } } : base;
    const docs: NotificationDoc[] = await col
      .find(listFilter)
      .sort({ createdAt: -1 })
      .limit(DEFAULT_PAGE_SIZE)
      .toArray();
    const unreadCount = await col.countDocuments({ ...base, seenAt: null });

    res.status(200).json({ notifications: docs.map(toPublicNotification), unreadCount });
  } catch (e) {
    handleError(res, e);
  }
}
