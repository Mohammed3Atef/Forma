import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { feedFilter, notificationsCol, toPublicNotification, type NotificationDoc } from '../../messages/_handlers/notifications-data.js';

const DEFAULT_PAGE_SIZE = 50;

/** tRPC port of `api/messages/_handlers/{notifications-index,notifications-mark-read}.ts`. */
export const notificationsRouter = router({
  /**
   * Polling-friendly read of the caller's own notification feed (routed by
   * role via `feedFilter`), newest-first, plus a cheap `unreadCount`.
   * `unreadCount` always reflects the whole feed; `notifications` is scoped
   * to `since` when given, else the last `DEFAULT_PAGE_SIZE`.
   */
  list: authedProcedure
    .input(z.object({ since: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const base = await feedFilter(ctx.user);
      if (!base) return { notifications: [], unreadCount: 0 };

      const col = await notificationsCol();
      const listFilter = input?.since != null ? { ...base, createdAt: { $gt: input.since } } : base;
      const docs: NotificationDoc[] = await col.find(listFilter).sort({ createdAt: -1 }).limit(DEFAULT_PAGE_SIZE).toArray();
      const unreadCount = await col.countDocuments({ ...base, seenAt: null });

      return { notifications: docs.map(toPublicNotification), unreadCount };
    }),

  /** Marks one notification (by id, scoped to the caller's own feed) or, with no id, the whole feed, as seen. */
  markRead: authedProcedure
    .input(z.object({ id: z.string().trim().min(1).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const base = await feedFilter(ctx.user);
      if (!base) return { ok: true, updated: 0 };

      const col = await notificationsCol();
      const now = Date.now();

      if (input?.id) {
        const result = await col.updateOne({ _id: input.id, ...base }, { $set: { seenAt: now, updatedAt: now } });
        if (result.matchedCount === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
        return { ok: true, updated: result.modifiedCount };
      }

      const result = await col.updateMany({ ...base, seenAt: null }, { $set: { seenAt: now, updatedAt: now } });
      return { ok: true, updated: result.modifiedCount };
    }),
});
