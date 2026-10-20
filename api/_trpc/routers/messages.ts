import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { CommercialReason } from '../../_lib/commercialReason.js';
import type { AuthedUser } from '../context.js';
import {
  coachConversationFilter,
  getActiveCoachClientIds,
  inWritableConversation,
  messagesCol,
  resolveThreadViewer,
  toPublicMessage,
  viewerFilter,
  visibleToViewer,
  EDIT_WINDOW_MS,
  REACTION_VALUES,
  type MessageAttachment,
  type MessageCategory,
  type MessageDoc,
  type ThreadViewer,
} from '../../messages/_data.js';
import { createNotification, feedFilter, notificationsCol } from '../../messages/_handlers/notifications-data.js';
import type { Filter } from 'mongodb';

const DEFAULT_PAGE_SIZE = 200;

/**
 * B3.0.1 / B3-S04 (owner O-17): a non-active account (suspended, disabled,
 * pending) may still READ the conversations it is authorized for, but never
 * writes — no send, edit, delete or react (attachments are refused by the
 * media policy, broadcast is a fan-out of `send`). Fixed reason, no detail.
 */
function assertCanWrite(user: AuthedUser): void {
  if (user.accountStatus !== 'active') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Your account is not active', cause: new CommercialReason('ACCOUNT_NOT_ACTIVE') });
  }
}

const conversationClosed = () =>
  new TRPCError({ code: 'CONFLICT', message: 'This conversation has ended', cause: new CommercialReason('CONVERSATION_CLOSED') });

/**
 * Loads a message the viewer may act on. A message outside a coach's own
 * conversation is reported as NOT_FOUND (never FORBIDDEN), so a probe cannot
 * confirm it exists. A client acting on an EARLIER coach's conversation gets
 * CONVERSATION_CLOSED: that history is read-only.
 */
async function loadActionableMessage(viewer: ThreadViewer, clientId: string, id: string): Promise<MessageDoc> {
  const col = await messagesCol();
  const doc = await col.findOne({ _id: id, clientId });
  if (!doc || doc.deletedAt || !visibleToViewer(viewer, doc)) throw new TRPCError({ code: 'NOT_FOUND' });
  if (!inWritableConversation(viewer, doc)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This conversation has ended', cause: new CommercialReason('CONVERSATION_CLOSED') });
  }
  return doc;
}

/** Sender-ownership + edit/delete-window checks shared by `edit` and `delete`. */
async function loadOwnMessageWithinWindow(viewer: ThreadViewer, clientId: string, id: string, userId: string): Promise<MessageDoc> {
  const doc = await loadActionableMessage(viewer, clientId, id);
  if (doc.fromUserId !== userId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the sender can do this.' });
  if (Date.now() - doc.createdAt > EDIT_WINDOW_MS) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'The 2-minute edit/delete window has passed.' });
  }
  return doc;
}

/**
 * B3.6: the URL is rendered as a link, an image and a media source, so only a
 * web address is accepted (any non-empty string was, e.g. a `javascript:`
 * URL a hand-made request could plant). Real attachments are always the
 * upload's https CDN URL; plain http is kept for local test stacks.
 */
const isWebUrl = (s: string): boolean => {
  try {
    const { protocol } = new URL(s);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const AttachmentSchema = z.object({
  url: z.string().trim().min(1).refine(isWebUrl, { message: 'An attachment must be a web (https) URL' }),
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
   * B3.0.1: a coach reads only their own conversation (B3-S14).
   */
  list: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), since: z.number().optional(), before: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      const col = await messagesCol();
      const base = { clientId: input.clientId, ...viewerFilter(viewer) };

      // `before` is a separate backward-pagination mode ("load older") — it
      // never combines with `since` (which is the forward polling cursor).
      if (input.before != null) {
        const older = await col
          .find({ ...base, createdAt: { $lt: input.before } })
          .sort({ createdAt: -1 })
          .limit(DEFAULT_PAGE_SIZE)
          .toArray();
        older.reverse();
        return { messages: older.map(toPublicMessage), cursor: input.before, hasMore: older.length === DEFAULT_PAGE_SIZE };
      }

      let docs: MessageDoc[];
      if (input.since != null) {
        docs = await col.find({ ...base, createdAt: { $gt: input.since } }).sort({ createdAt: 1 }).toArray();
      } else {
        docs = await col.find(base).sort({ createdAt: -1 }).limit(DEFAULT_PAGE_SIZE).toArray();
        docs.reverse();
      }

      const cursor = docs.length > 0 ? docs[docs.length - 1].createdAt : (input.since ?? Date.now());
      return { messages: docs.map(toPublicMessage), cursor, hasMore: input.since == null && docs.length === DEFAULT_PAGE_SIZE };
    }),

  /**
   * Sends a message into the caller's conversation, then best-effort notifies
   * the other party. B3.0.1: active accounts only (B3-S04); written to the
   * coach's own conversation, or — for a client — to the CURRENT coach's. A
   * `coachId` input names the conversation the message was composed in (the
   * durable outbox sends it): if that is no longer the current conversation
   * the send is refused, so a queued message can never reach a newly assigned
   * coach after a transfer (B3-S14).
   */
  send: authedProcedure
    .input(
      z
        .object({
          clientId: z.string().trim().min(1),
          text: z.string().trim().max(4000),
          category: z.enum(['message', 'announcement', 'offer', 'reminder', 'update']).optional(),
          attachment: AttachmentSchema.optional(),
          /** Client-generated idempotency key — a retried send with the same key returns the already-inserted message instead of duplicating it. */
          clientMsgId: z.string().trim().min(1).max(100).optional(),
          /** B3.0.1: the conversation (coach id) the message was composed in. Optional for older clients. */
          coachId: z.string().trim().min(1).max(200).optional(),
        })
        // A message must carry SOMETHING — the UI already disables "send" on an
        // empty composer, but the server is the real guard.
        .refine((v) => v.text.length > 0 || !!v.attachment, { message: 'A message needs text or an attachment', path: ['text'] }),
    )
    .mutation(async ({ ctx, input }) => {
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      const col = await messagesCol();

      // An already-delivered retry returns the original (a read, not a write).
      if (input.clientMsgId) {
        const existing = await col.findOne({ clientId: input.clientId, fromUserId: ctx.user.id, clientMsgId: input.clientMsgId });
        if (existing) return toPublicMessage(existing);
      }
      assertCanWrite(ctx.user);

      let coachId: string | undefined;
      if (viewer.kind === 'coach') {
        if (input.coachId && input.coachId !== viewer.coachId) throw conversationClosed();
        coachId = viewer.coachId;
      } else {
        if (viewer.kind === 'client' && !viewer.currentCoachId) {
          throw new TRPCError({ code: 'CONFLICT', message: 'You have no coach to message right now', cause: new CommercialReason('NO_ACTIVE_COACH') });
        }
        if (input.coachId && input.coachId !== viewer.currentCoachId) throw conversationClosed();
        coachId = viewer.currentCoachId;
      }

      const now = Date.now();
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
      try {
        await col.insertOne(doc);
      } catch (e) {
        // Two concurrent retries of the same send both passed the read above —
        // the partial unique index (`messagesCol`) let exactly one insert win;
        // hand the loser that same message instead of a 500.
        if (input.clientMsgId && e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000) {
          const winner = await col.findOne({ clientId: input.clientId, fromUserId: ctx.user.id, clientMsgId: input.clientMsgId });
          if (winner) return toPublicMessage(winner);
        }
        throw e;
      }

      const toCoach = viewer.kind !== 'coach';
      // A coach-bound preview goes to THIS conversation's coach only (B3-S14).
      if (!toCoach || coachId) {
        const preview = input.text || (input.attachment ? `📎 ${input.attachment.name ?? input.attachment.kind}` : '');
        await createNotification({
          clientId: input.clientId,
          forRole: toCoach ? 'coach' : 'client',
          ...(toCoach && coachId ? { coachId } : {}),
          type: 'message_received',
          body: preview.slice(0, 140),
          route: toCoach ? `/coach/messages/${input.clientId}` : '/messages',
          createdBy: ctx.user.id,
        });
      }

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
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      assertCanWrite(ctx.user);
      await loadOwnMessageWithinWindow(viewer, input.clientId, input.id, ctx.user.id);
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
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      assertCanWrite(ctx.user);
      await loadOwnMessageWithinWindow(viewer, input.clientId, input.id, ctx.user.id);
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
   * conversation may react (not sender-only); a client's earlier
   * conversations are read-only (B3-S14).
   */
  react: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), id: z.string().trim().min(1), value: z.enum(REACTION_VALUES).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      assertCanWrite(ctx.user);
      await loadActionableMessage(viewer, input.clientId, input.id);
      const col = await messagesCol();

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
   * raised for the caller. Only a read receipt — allowed for a suspended
   * account (O-17). A coach marks only their own conversation (B3-S14).
   */
  markRead: authedProcedure
    .input(z.object({ clientId: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const viewer = await resolveThreadViewer(ctx.user, input.clientId);
      const now = Date.now();

      // B3.6: a read receipt is recorded only by the message's ADDRESSEE — the
      // client reads what the coach (or the platform) wrote, the coach reads what
      // the client wrote; an admin reads the thread as an observer and records
      // none. (It used to be "every message not from my role": an admin's read
      // marked the coach's messages Seen, and a coach's read marked an admin's
      // message to the client seen.)
      const addressed: Filter<MessageDoc> | null =
        viewer.kind === 'client' ? { fromRole: { $ne: 'client' } } : viewer.kind === 'coach' ? { fromRole: 'client' } : null;
      let modifiedCount = 0;
      if (addressed) {
        const messages = await messagesCol();
        ({ modifiedCount } = await messages.updateMany(
          { clientId: input.clientId, ...addressed, seenAt: null, ...viewerFilter(viewer) },
          { $set: { seenAt: now, updatedAt: now } },
        ));
      }

      try {
        const filter = await feedFilter(ctx.user);
        if (filter) {
          const notifications = await notificationsCol();
          // Reading the thread is the task a message notification asks for:
          // mark them read AND done (B0 / NT-03) — only the caller's own.
          await notifications.updateMany(
            { $and: [filter, { clientId: input.clientId, type: 'message_received', resolvedAt: null }] },
            [{ $set: { seenAt: { $ifNull: ['$seenAt', now] }, resolvedAt: now, updatedAt: now } }],
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
   * full-thread fetch per client on every tick. B3.0.1: only the coach's own
   * conversation counts — no preview or unread count from an earlier coach.
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
          { $match: { clientId: { $in: clientIds }, ...coachConversationFilter(coachId) } },
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
