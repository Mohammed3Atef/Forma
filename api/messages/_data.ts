import { Collection } from 'mongodb';
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
  /** Denormalized assigned-coach id at send time (best-effort; may be absent). */
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

export async function messagesCol(): Promise<Collection<MessageDoc>> {
  return (await getDb()).collection<MessageDoc>('messages');
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
  if (user.id === clientId) return;
  if (hasPermission(user.role, user.accountStatus, user.permissions, 'clients.writeAll')) return;
  if (user.role === 'coach' && (await isAssignedCoach(user.id, clientId))) return;
  throw new TRPCError({ code: 'FORBIDDEN' });
}
