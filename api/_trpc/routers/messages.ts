import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import {
  authorizeThreadAccess,
  getActiveCoachClientIds,
  getAssignedCoachId,
  messagesCol,
  toPublicMessage,
  EDIT_WINDOW_MS,
  REACTION_VALUES,
  type MessageAttachment,
  type MessageCategory,
  type MessageDoc,
} from '../../messages/_data.js';
import { createNotification, feedFilter, notificationsCol } from '../../messages/_handlers/notifications-data.js';

const DEFAULT_PAGE_SIZE = 200;

/** Loads the message + runs the shared sender-ownership + edit/delete-window checks used by both `edit` and `delete`. */
async function loadOwnMessageWithinWindow(clientId: string, id: string, userId: string): Promise<MessageDoc> {
  const col = await messagesCol();
  const doc = await col.findOne({ _id: id, clientId });
  if (!doc || doc.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });
  if (doc.fromUserId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the sender can do this.' });
  if (Date.now() - doc.createdAt > EDIT_WINDOW_MS) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'The 2-minute edit/delete window has passed.' });
  }
  return doc;
}

const AttachmentSchema = z.object({
  url: z.string().trim().min(1),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  name: z.string().trim().max(200).optional(),
  size: z.number().nonnegative().optional(),
  mimeType: z.string().trim().max(200).optional(),
});

/** tRPC port of `api/messages/_handlers/{index,mark-read}.ts`. */
export const messagesRouter = router({
  /**
   * Polling-friendly read of one client's 1:1 thread, oldest-first: with
   * `since`, only messages strictly after it; otherwise the last
   * `DEFAULT_PAGE_SIZE` messages. Returns a `cursor` for the next poll.
   */
  list: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), since: z.number().optional(), before: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      const col = await messagesCol();

      // `before` is a separate backward-pagination mode ("load older") — it
      // never combines with `since` (which is the forward polling cursor).
      if (input.before != null) {
        const older = await col
          .find({ clientId: input.clientId, createdAt: { $lt: input.before } })
          .sort({ createdAt: -1 })
          .limit(DEFAULT_PAGE_SIZE)
          .toArray();
        older.reverse();
        return { messages: older.map(toPublicMessage), cursor: input.before, hasMore: older.length === DEFAULT_PAGE_SIZE };
      }

      let docs: MessageDoc[];
      if (input.since != null) {
        docs = await col.find({ clientId: input.clientId, createdAt: { $gt: input.since } }).sort({ createdAt: 1 }).toArray();
      } else {
        docs = await col.find({ clientId: input.clientId }).sort({ createdAt: -1 }).limit(DEFAULT_PAGE_SIZE).toArray();
        docs.reverse();
      }

      const cursor = docs.length > 0 ? docs[docs.length - 1].createdAt : (input.since ?? Date.now());
      return { messages: docs.map(toPublicMessage), cursor, hasMore: input.since == null && docs.length === DEFAULT_PAGE_SIZE };
    }),

  /** Sends a message into the thread as the caller, then best-effort notifies the other party. */
  send: authedProcedure
    .input(
      z.object({
        clientId: z.string().trim().min(1),
        text: z.string().trim().max(4000),
        category: z.enum(['message', 'announcement', 'offer', 'reminder', 'update']).optional(),
        attachment: AttachmentSchema.optional(),
        /** Client-generated idempotency key — a retried send with the same key returns the already-inserted message instead of duplicating it. */
        clientMsgId: z.string().trim().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      const col = await messagesCol();

      if (input.clientMsgId) {
        const existing = await col.findOne({ clientId: input.clientId, fromUserId: ctx.user.id, clientMsgId: input.clientMsgId });
        if (existing) return toPublicMessage(existing);
      }

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
      if (input.clientMsgId) doc.clientMsgId = input.clientMsgId;
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
   * Sender-only, within `EDIT_WINDOW_MS` of send. The window is enforced here
   * against the DB's own `createdAt` (server time) — the client UI hiding the
   * Edit action past 2 minutes is a convenience, never the real guard.
   */
  edit: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), id: z.string().trim().min(1), text: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      await loadOwnMessageWithinWindow(input.clientId, input.id, ctx.user.id);
      const now = Date.now();
      const col = await messagesCol();
      await col.updateOne({ _id: input.id, clientId: input.clientId }, { $set: { body: input.text, editedAt: now, updatedAt: now } });
      const updated = await col.findOne({ _id: input.id, clientId: input.clientId });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return toPublicMessage(updated);
    }),

  /**
   * Sender-only, within `EDIT_WINDOW_MS` of send. Soft-delete: the row (and
   * its real body/attachment) stays in Mongo for audit; `toPublicMessage`
   * redacts both once `deletedAt` is set, so every reader — this response,
   * every future `list`/`coachThreadsSummary` call — sees a tombstone.
   */
  delete: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), id: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      await loadOwnMessageWithinWindow(input.clientId, input.id, ctx.user.id);
      const now = Date.now();
      const col = await messagesCol();
      await col.updateOne({ _id: input.id, clientId: input.clientId }, { $set: { deletedAt: now, updatedAt: now } });
      const updated = await col.findOne({ _id: input.id, clientId: input.clientId });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return toPublicMessage(updated);
    }),

  /**
   * One reaction per user per message — `value: null` removes the caller's
   * reaction, any other allowed value sets/replaces it. Either party in the
   * thread may react (not sender-only), so this only needs
   * `authorizeThreadAccess`, not the ownership+window check `edit`/`delete` use.
   */
  react: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), id: z.string().trim().min(1), value: z.enum(REACTION_VALUES).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await authorizeThreadAccess(ctx.user, input.clientId);
      const col = await messagesCol();
      const existing = await col.findOne({ _id: input.id, clientId: input.clientId });
      if (!existing || existing.deletedAt) throw new TRPCError({ code: 'NOT_FOUND' });

      const now = Date.now();
      if (input.value == null) {
        await col.updateOne({ _id: input.id, clientId: input.clientId }, { $unset: { [`reactions.${ctx.user.id}`]: '' }, $set: { updatedAt: now } });
      } else {
        await col.updateOne({ _id: input.id, clientId: input.clientId }, { $set: { [`reactions.${ctx.user.id}`]: input.value, updatedAt: now } });
      }
      const updated = await col.findOne({ _id: input.id, clientId: input.clientId });
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });
      return toPublicMessage(updated);
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

  /**
   * One-shot summary (last message + unread-for-coach count) across every one
   * of a coach's active client threads, computed with a single aggregation
   * instead of fetching each thread's full message list. Replaces the old
   * client-side pattern of opening one polling subscription per client
   * thread (`subscribeCoachUnread`/the inbox list previews), which cost one
   * full-thread fetch per client on every tick.
   */
  coachThreadsSummary: authedProcedure
    .input(z.object({ coachId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const coachId = input.coachId ?? ctx.user.id;
      if (ctx.user.id !== coachId && !hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'clients.writeAll')) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const clientIds = await getActiveCoachClientIds(coachId);
      if (clientIds.length === 0) return [];

      const col = await messagesCol();
      const rows = await col
        .aggregate<{ _id: string; last: MessageDoc; unreadForCoach: number }>([
          { $match: { clientId: { $in: clientIds } } },
          { $sort: { createdAt: 1 } },
          {
            $group: {
              _id: '$clientId',
              last: { $last: '$$ROOT' },
              unreadForCoach: { $sum: { $cond: [{ $and: [{ $eq: ['$fromRole', 'client'] }, { $eq: ['$seenAt', null] }] }, 1, 0] } },
            },
          },
        ])
        .toArray();

      const byClient = new Map(rows.map((r) => [r._id, r]));
      return clientIds.map((clientId) => {
        const row = byClient.get(clientId);
        return {
          clientId,
          last: row ? toPublicMessage(row.last) : null,
          unreadForCoach: row?.unreadForCoach ?? 0,
        };
      });
    }),
});
