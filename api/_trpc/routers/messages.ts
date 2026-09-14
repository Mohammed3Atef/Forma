import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';
import {
  authorizeThreadAccess,
  getAssignedCoachId,
  messagesCol,
  toPublicMessage,
  type MessageAttachment,
  type MessageCategory,
  type MessageDoc,
} from '../../messages/_data.js';
import { createNotification, feedFilter, notificationsCol } from '../../messages/_handlers/notifications-data.js';

const DEFAULT_PAGE_SIZE = 200;

const AttachmentSchema = z.object({
  url: z.string().trim().min(1),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  name: z.string().trim().max(200).optional(),
  size: z.number().nonnegative().optional(),
});

/** tRPC port of `api/messages/_handlers/{index,mark-read}.ts`. */
export const messagesRouter = router({
  /**
   * Polling-friendly read of one client's 1:1 thread, oldest-first: with
   * `since`, only messages strictly after it; otherwise the last
   * `DEFAULT_PAGE_SIZE` messages. Returns a `cursor` for the next poll.
   */
  list: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), since: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      const col = await messagesCol();

      let docs: MessageDoc[];
      if (input.since != null) {
        docs = await col.find({ clientId: input.clientId, createdAt: { $gt: input.since } }).sort({ createdAt: 1 }).toArray();
      } else {
        docs = await col.find({ clientId: input.clientId }).sort({ createdAt: -1 }).limit(DEFAULT_PAGE_SIZE).toArray();
        docs.reverse();
      }

      const cursor = docs.length > 0 ? docs[docs.length - 1].createdAt : (input.since ?? Date.now());
      return { messages: docs.map(toPublicMessage), cursor };
    }),

  /** Sends a message into the thread as the caller, then best-effort notifies the other party. */
  send: authedProcedure
    .input(
      z.object({
        clientId: z.string().trim().min(1),
        text: z.string().trim().max(4000),
        category: z.enum(['message', 'announcement', 'offer', 'reminder', 'update']).optional(),
        attachment: AttachmentSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);

      const now = Date.now();
      const coachId = ctx.user.role === 'coach' ? ctx.user.id : await getAssignedCoachId(input.clientId);
      const doc: MessageDoc = {
        _id: `msg_${now}_${Math.random().toString(36).slice(2, 10)}`,
        clientId: input.clientId,
        fromUserId: ctx.user.id,
        fromRole: ctx.user.role,
        body: input.text,
        seenAt: null,
        createdAt: now,
        updatedAt: now,
      };
      if (coachId) doc.coachId = coachId;
      if (input.category) doc.category = input.category as MessageCategory;
      if (input.attachment) doc.attachment = input.attachment as MessageAttachment;
      const col = await messagesCol();
      await col.insertOne(doc);

      const toCoach = ctx.user.role !== 'coach';
      const preview = input.text || (input.attachment ? `📎 ${input.attachment.name ?? input.attachment.kind}` : '');
      await createNotification({
        clientId: input.clientId,
        forRole: toCoach ? 'coach' : 'client',
        type: 'message_received',
        body: preview.slice(0, 140),
        route: toCoach ? `/coach/messages/${input.clientId}` : '/messages',
        createdBy: ctx.user.id,
      });

      return toPublicMessage(doc);
    }),

  /**
   * Marks every message from the OTHER party as seen by the caller, then
   * best-effort clears any `message_received` notifications this thread
   * raised for the caller.
   */
  markRead: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      const readerRole = ctx.user.role === 'coach' ? 'coach' : 'client';
      const now = Date.now();

      const messages = await messagesCol();
      const { modifiedCount } = await messages.updateMany(
        { clientId: input.clientId, fromRole: { $ne: ctx.user.role }, seenAt: null },
        { $set: { seenAt: now, updatedAt: now } },
      );

      try {
        const filter = await feedFilter(ctx.user);
        if (filter) {
          const notifications = await notificationsCol();
          await notifications.updateMany(
            { clientId: input.clientId, forRole: readerRole, type: 'message_received', seenAt: null },
            { $set: { seenAt: now, updatedAt: now } },
          );
        }
      } catch (e) {
        console.warn('[messages.markRead] notification cleanup failed (non-fatal):', e);
      }

      return { ok: true, updated: modifiedCount };
    }),
});
