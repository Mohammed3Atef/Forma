import type { Collection, Filter } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import { coachClientsCol, getAssignedCoachId } from '../_data.js';
import type { AuthedUser } from '../../_trpc/context.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `AppNotification` /
 * `NotificationType` — flattened out of the Firestore-era
 * `clientData/{clientId}/notifications/{id}` subcollection into one top-level
 * Mongo collection. Field names are kept identical to the frontend type
 * (minus `id`, which Mongo gives us as `_id`) so a future polling-hook swap is
 * a clean drop-in.
 */
import type { NotificationType } from '../../_lib/notificationTypes.js';
export type { NotificationType };

/**
 * Backend-local mirror of `src/types/index.ts`'s `NoteScreen` — kept in sync
 * by hand, same discipline as `Role`/`Permission` in `api/_lib/types.ts`.
 * (Only needed now that tRPC actually type-checks this shape against the
 * frontend's `AppNotification`, instead of the old REST route's `apiGet<T>`
 * blind cast.)
 */
export type NoteScreen = 'nutrition' | 'workout' | 'cardio' | 'progress' | 'measurements' | 'photos';

/** Backend-local mirror of `src/types/index.ts`'s `NoteEntityType`. */
export type NoteEntityType =
  | 'meal'
  | 'food'
  | 'water'
  | 'supplement'
  | 'exercise'
  | 'workout_day'
  | 'cardio_session'
  | 'measurement'
  | 'weight_entry'
  | 'progress_photo'
  | 'checkin';

export interface NotificationDoc {
  _id: string;
  clientId: string;
  forRole: 'client' | 'coach';
  type: NotificationType;
  body?: string;
  screen?: NoteScreen;
  date?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  route?: string;
  /** coach_note only: set when the note was explicitly shared with the client. */
  noteVisibility?: 'client';
  /**
   * B3.0.1 / B3-S14: for a coach-bound notification, the coach it is FOR (the
   * client's coach when it was raised). A coach's feed only shows their own;
   * rows written before B3.0.1 have none and are shown only to the coach whose
   * current relationship was already active when they were created.
   */
  coachId?: string;
  /**
   * B0 / NT-03 — three states, one meaning each:
   *  - `seenAt`     READ: the user saw it (opened it, opened the thread, or "Mark all read").
   *                 The unread badge counts rows with `seenAt: null`.
   *  - `resolvedAt` DONE: the task it asked for was completed (check-in submitted /
   *                 reviewed, freeze decided, assessment reviewed, thread read).
   *                 Resolving also marks it read, so a finished task never stays unread.
   */
  resolvedAt?: number | null;
  seenAt?: number | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** The exact shape returned to the frontend — same fields as `AppNotification`, `id` instead of `_id`. */
export type PublicNotification = Omit<NotificationDoc, '_id'> & { id: string };

/**
 * Marks every open notification matching `match` as DONE (and read) — called
 * by the handler that completes the task (B0 / NT-03). Best-effort: a failure
 * here must never fail the primary action.
 */
export async function resolveNotifications(match: { clientId: string; forRole: 'client' | 'coach'; type: NotificationType; entityId?: string }): Promise<void> {
  try {
    const now = Date.now();
    const col = await notificationsCol();
    await col.updateMany({ ...match, resolvedAt: null }, [{ $set: { resolvedAt: now, seenAt: { $ifNull: ['$seenAt', now] }, updatedAt: now } }]);
  } catch (e) {
    console.warn('[notifications] resolve failed (non-fatal):', e);
  }
}

export function toPublicNotification(doc: NotificationDoc): PublicNotification {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

export async function notificationsCol(): Promise<Collection<NotificationDoc>> {
  return (await getDb()).collection<NotificationDoc>('notifications');
}

/** Fields the caller supplies; id/timestamps/seenAt are filled in here. */
export type NewNotification = Omit<NotificationDoc, '_id' | 'createdAt' | 'updatedAt' | 'seenAt'>;

/**
 * Best-effort: writes an in-app notification (mirrors `notify()` in the
 * Firestore-era `notificationsApi.ts`). A failed notification must NEVER block
 * the primary action that raised it — callers should not await-and-throw on
 * this. Not a route: an internal helper other backend modules (e.g.
 * `api/messages`) import directly.
 */
export async function createNotification(n: NewNotification): Promise<void> {
  try {
    const col = await notificationsCol();
    const now = Date.now();
    const doc: NotificationDoc = {
      _id: `ntf_${now}_${Math.random().toString(36).slice(2, 10)}`,
      clientId: n.clientId,
      forRole: n.forRole,
      type: n.type,
      seenAt: null,
      createdAt: now,
      createdBy: n.createdBy,
      updatedAt: now,
    };
    if (n.body != null) doc.body = n.body;
    if (n.screen != null) doc.screen = n.screen;
    if (n.date != null) doc.date = n.date;
    if (n.entityType != null) doc.entityType = n.entityType;
    if (n.entityId != null) doc.entityId = n.entityId;
    if (n.route != null) doc.route = n.route;
    if (n.forRole === 'coach') {
      const coachId = n.coachId ?? (await getAssignedCoachId(n.clientId));
      if (coachId) doc.coachId = coachId;
    }
    await col.insertOne(doc);
  } catch (e) {
    console.warn('[createNotification] write failed (non-fatal):', e);
  }
}

/**
 * The Mongo filter for "the signed-in user's own notification feed", mirroring
 * the role-routing in `useNotifications`: a client sees their own client-bound
 * feed; a coach sees coach-bound alerts across their active clients plus their
 * own doc (self-addressed alerts). Admin/super_admin have no notifications-
 * collection feed today (their signal is the separate coachPlanChangeRequests
 * flow, out of scope here) — returns `null` for them, meaning "empty feed".
 *
 * B3.0.1 / B3-S14: per active client, a coach sees only notifications raised
 * FOR them (`coachId == me`), plus legacy rows (no `coachId`) created since
 * their current relationship began — never an earlier coach's previews.
 */
export async function feedFilter(user: AuthedUser): Promise<Filter<NotificationDoc> | null> {
  if (user.role === 'client') {
    return { clientId: user.id, forRole: 'client' };
  }
  if (user.role === 'coach') {
    const rels = await (await coachClientsCol()).find({ coachId: user.id, status: 'active' }, { projection: { clientId: 1, createdAt: 1 } }).toArray();
    return {
      forRole: 'coach',
      $or: [
        { clientId: user.id },
        ...rels.map((r) => ({ clientId: r.clientId, $or: [{ coachId: user.id }, { coachId: { $exists: false }, createdAt: { $gte: r.createdAt } }] })),
      ],
    };
  }
  return null;
}
