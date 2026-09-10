import { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';
import { hasPermission } from '../_lib/rbac.js';
import { HttpError } from '../_lib/http.js';
import type { AuthedUser } from '../_lib/withAuth.js';
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
}

/** The exact shape returned to the frontend — same fields as `Message`, `id` instead of `_id`. */
export type PublicMessage = Omit<MessageDoc, '_id'> & { id: string };

export function toPublicMessage(doc: MessageDoc): PublicMessage {
  const { _id, ...rest } = doc;
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
  throw new HttpError(403, 'Forbidden');
}
