import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { handleError, methodGuard } from '../_lib/http';
import { requireUser } from '../_lib/withAuth';
import { feedFilter, notificationsCol } from '../notifications/_data';
import { authorizeThreadAccess, messagesCol } from './_data';

const Body = z.object({
  clientId: z.string().trim().min(1),
});

/**
 * POST /api/messages/mark-read { clientId }
 *   Marks every message from the OTHER party in this thread as seen by the
 *   caller (mirrors `markThreadSeen`), then best-effort clears any
 *   `message_received` notifications this thread raised for the caller
 *   (mirrors `markMessageNotificationsSeen`) so the bell/feed stay in sync.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    const { clientId } = Body.parse(req.body);
    await authorizeThreadAccess(user, clientId);

    const readerRole = user.role === 'coach' ? 'coach' : 'client';
    const now = Date.now();

    const messages = await messagesCol();
    const { modifiedCount } = await messages.updateMany(
      { clientId, fromRole: { $ne: user.role }, seenAt: null },
      { $set: { seenAt: now, updatedAt: now } },
    );

    // Best-effort: clear the matching message_received alerts for the reader's
    // own audience in this thread. Never blocks the primary mark-read action.
    try {
      const filter = await feedFilter(user);
      if (filter) {
        const notifications = await notificationsCol();
        await notifications.updateMany(
          { clientId, forRole: readerRole, type: 'message_received', seenAt: null },
          { $set: { seenAt: now, updatedAt: now } },
        );
      }
    } catch (e) {
      console.warn('[messages/mark-read] notification cleanup failed (non-fatal):', e);
    }

    res.status(200).json({ ok: true, updated: modifiedCount });
  } catch (e) {
    handleError(res, e);
  }
}
