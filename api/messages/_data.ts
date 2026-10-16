import type { Collection, Filter } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { getDb } from '../_lib/mongodb.js';
import { hasPermission } from '../_lib/rbac.js';
import type { AuthedUser } from '../_trpc/context.js';
import type { Role } from '../_lib/types.js';
import type { CoachClientDoc } from '../coach-clients/_types.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `Message` / `MessageAttachment` /
 * `MessageCategory` — flattened out of the Firestore-era
 * `clientData/{clientId}/messages/{id}` subcollection into one top-level Mongo
 * collection. Field names are kept identical to the frontend `Message` type
 * (minus `id`, which Mongo gives us as `_id`) so a future polling-hook swap is a
 * clean drop-in. `coachId` is a new denormalized field (not on the Firestore
 * doc) purely so "all messages for this client" can be queried without a join
 * to `coachClients`.
 */
export type MessageAttachment = {
  url: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  name?: string;
  size?: number;
  /** Original file MIME type — additive; absent on messages sent before this field existed. */
  mimeType?: string;
};

export type MessageCategory = 'message' | 'announcement' | 'offer' | 'reminder' | 'update';

export interface MessageDoc {
  _id: string;
  clientId: string;
  /**
   * The CONVERSATION the message belongs to: the coach's own id when a coach
   * sends, the client's current coach when the client (or an admin) sends.
   * B3.0.1 / B3-S14 (owner R-4): a coach only ever sees their own
   * conversation. Absent on legacy messages (pre-Mongo, or sent while the
   * client had no coach) — those are never shown to a coach unless the coach
   * wrote them.
   */
  coachId?: string;
  fromUserId: string;
  fromRole: Role;
  body: string;
  attachment?: MessageAttachment;
  category?: MessageCategory;
  broadcast?: boolean;
  seenAt?: number | null;
  createdAt: number;
  updatedAt: number;
  /**
   * Client-generated idempotency key (set on `send`). A retried send with the
   * same `clientId`+`fromUserId`+`clientMsgId` returns the ALREADY-inserted
   * doc instead of creating a duplicate — see `send` in `messages.ts`. Purely
   * additive; older docs simply lack it and are never matched by one.
   */
  clientMsgId?: string;
  /** Set by `edit` — sender-only, within `EDIT_WINDOW_MS` of `createdAt`. */
  editedAt?: number;
  /**
   * Soft-delete tombstone. The row (and its real `body`/`attachment`) stays in
   * Mongo for audit — `toPublicMessage` redacts both before they ever reach
   * the wire once this is set, so "deleted" is enforced at the read boundary,
   * not by trusting every caller to check the flag themselves.
   */
  deletedAt?: number;
  /** One reaction per user: `userId -> emoji`. Additive; absent on older docs. */
  reactions?: Record<string, string>;
}

/** The exact shape returned to the frontend — same fields as `Message`, `id` instead of `_id`. */
export type PublicMessage = Omit<MessageDoc, '_id'> & { id: string };

/** The only reaction values `react` accepts — validated again server-side, not just in the zod schema, since this array is the single source of truth for both. */
export const REACTION_VALUES = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type ReactionValue = (typeof REACTION_VALUES)[number];

/** How long after `createdAt` a sender may still edit/delete their own message — enforced here (server time), never trusting the client's clock. */
export const EDIT_WINDOW_MS = 2 * 60 * 1000;

export function toPublicMessage(doc: MessageDoc): PublicMessage {
  const { _id, ...rest } = doc;
  if (rest.deletedAt) {
    // Redact at the read boundary — every caller of `toPublicMessage` gets a
    // tombstone automatically, instead of each router procedure having to
    // remember to strip content itself.
    return { id: _id, ...rest, body: '', attachment: undefined, reactions: undefined };
  }
  return { id: _id, ...rest };
}

/**
 * `send`'s retry guard (`clientMsgId`) is only truly idempotent if the
 * database itself refuses a second row for the same key — a find-then-insert
 * check alone lets two concurrent retries both pass the "not yet inserted"
 * read. Partial unique index so rows without a `clientMsgId` (every message
 * sent before the key existed, plus sends that omit it) are never affected.
 * Self-ensured here (idempotent createIndex, same pattern as
 * `api/coach-assets/_lib/db.ts`) and also declared in
 * `scripts/mongo-init-indexes.mjs`.
 */
export async function messagesCol(): Promise<Collection<MessageDoc>> {
  const col = (await getDb()).collection<MessageDoc>('messages');
  await col.createIndex(
    { clientId: 1, fromUserId: 1, clientMsgId: 1 },
    { unique: true, partialFilterExpression: { clientMsgId: { $exists: true } }, name: 'uniq_clientMsgId' },
  );
  return col;
}

/**
 * `coachClients` collection (owned by the `api/coach-clients` module — we
 * only ever read it here). `_id` is `${coachId}__${clientId}`. `CoachClientDoc`
 * is imported from there rather than re-declared so the two modules can't
 * drift out of sync.
 */
export async function coachClientsCol(): Promise<Collection<CoachClientDoc>> {
  return (await getDb()).collection<CoachClientDoc>('coachClients');
}

/** Whether `coachId` is the live, active coach for `clientId`. */
export async function isAssignedCoach(coachId: string, clientId: string): Promise<boolean> {
  const col = await coachClientsCol();
  const rel = await col.findOne({ _id: `${coachId}__${clientId}`, status: 'active' });
  return !!rel;
}

/** Active client ids for a coach (mirrors `coachClientIds` in the Firestore-era messagesApi). */
export async function getActiveCoachClientIds(coachId: string): Promise<string[]> {
  const col = await coachClientsCol();
  const docs = await col.find({ coachId, status: 'active' }).toArray();
  return docs.map((d) => d.clientId);
}

/** The client's current active coach id, if any — used to denormalize `coachId` onto a message. */
export async function getAssignedCoachId(clientId: string): Promise<string | undefined> {
  const col = await coachClientsCol();
  const rel = await col.findOne({ clientId, status: 'active' });
  return rel?.coachId;
}

/**
 * Authorization for a client's 1:1 thread — mirrors firestore.rules'
 * `clientData/{clientId}/messages/{docId}`: the client themself, their
 * currently-assigned coach, or an admin holding `clients.writeAll` (NOT
 * `clients.readAll` — messages are intentionally not covered by generic
 * read-only admin oversight). Throws 403 rather than returning a boolean so
 * every route can just call this and move on.
 */
export async function authorizeThreadAccess(user: AuthedUser, clientId: string): Promise<void> {
  await resolveThreadViewer(user, clientId);
}

/**
 * How the caller sees a client's thread (B3.0.1 / B3-S14, owner R-4 Option C):
 *  - coach  — only their OWN conversation (`coachId == me`), and only while
 *             their relationship is active;
 *  - client — the whole thread; only the CURRENT coach's conversation is
 *             writable, earlier conversations are read-only history;
 *  - admin  — (`clients.writeAll`) the whole thread, including legacy
 *             messages with no conversation (the documented fallback).
 */
export type ThreadViewer =
  | { kind: 'coach'; coachId: string }
  | { kind: 'client'; currentCoachId: string | undefined }
  | { kind: 'admin'; currentCoachId: string | undefined };

/** Same rule as `authorizeThreadAccess`, returning the viewer. Throws FORBIDDEN for anyone else. */
export async function resolveThreadViewer(user: AuthedUser, clientId: string): Promise<ThreadViewer> {
  if (user.id === clientId) return { kind: 'client', currentCoachId: await getAssignedCoachId(clientId) };
  if (hasPermission(user.role, user.accountStatus, user.permissions, 'clients.writeAll')) return { kind: 'admin', currentCoachId: await getAssignedCoachId(clientId) };
  if (user.role === 'coach' && (await isAssignedCoach(user.id, clientId))) return { kind: 'coach', coachId: user.id };
  throw new TRPCError({ code: 'FORBIDDEN' });
}

/**
 * The messages a coach may see: their own conversation, plus legacy messages
 * (no `coachId`) they wrote themselves — never a legacy message from the
 * client, whose addressee cannot be proven.
 */
export function coachConversationFilter(coachId: string): Filter<MessageDoc> {
  return { $or: [{ coachId }, { coachId: { $exists: false }, fromUserId: coachId }] };
}

/** Extra filter applied to every read of the thread for this viewer. */
export function viewerFilter(v: ThreadViewer): Filter<MessageDoc> {
  return v.kind === 'coach' ? coachConversationFilter(v.coachId) : {};
}

/** The message is in the conversation this viewer may WRITE to (react / edit / delete). */
export function inWritableConversation(v: ThreadViewer, m: Pick<MessageDoc, 'coachId' | 'fromUserId'>): boolean {
  if (v.kind === 'coach') return m.coachId === v.coachId || (m.coachId == null && m.fromUserId === v.coachId);
  if (v.kind === 'client') return !!v.currentCoachId && m.coachId === v.currentCoachId;
  return true;
}

/** The viewer may SEE the message at all (coaches: own conversation only). */
export function visibleToViewer(v: ThreadViewer, m: Pick<MessageDoc, 'coachId' | 'fromUserId'>): boolean {
  return v.kind !== 'coach' || inWritableConversation(v, m);
}
