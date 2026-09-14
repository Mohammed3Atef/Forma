import { Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import { getActiveCoachClientIds } from '../_data.js';
import type { AuthedUser } from '../../_lib/withAuth.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `AppNotification` /
 * `NotificationType` — flattened out of the Firestore-era
 * `clientData/{clientId}/notifications/{id}` subcollection into one top-level
 * Mongo collection. Field names are kept identical to the frontend type
 * (minus `id`, which Mongo gives us as `_id`) so a future polling-hook swap is
 * a clean drop-in.
 */
export type NotificationType =
  | 'coach_note'
  | 'plan_assigned'
  | 'targets_updated'
  | 'subscription_updated'
  | 'freeze_decided'
  | 'measurement_added'
  | 'assessment_reviewed'
  | 'freeze_requested'
  | 'assessment_submitted'
  | 'checkin_requested'
  | 'checkin_submitted'
  | 'checkin_reviewed'
  | 'message_received'
  | 'trial_expiring'
  | 'plan_change_requested';

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
  seenAt?: number | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** The exact shape returned to the frontend — same fields as `AppNotification`, `id` instead of `_id`. */
export type PublicNotification = Omit<NotificationDoc, '_id'> & { id: string };

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
 */
export async function feedFilter(user: AuthedUser): Promise<{ clientId: string | { $in: string[] }; forRole: 'client' | 'coach' } | null> {
  if (user.role === 'client') {
    return { clientId: user.id, forRole: 'client' };
  }
  if (user.role === 'coach') {
    const clientIds = await getActiveCoachClientIds(user.id);
    return { clientId: { $in: [user.id, ...clientIds] }, forRole: 'coach' };
  }
  return null;
}
