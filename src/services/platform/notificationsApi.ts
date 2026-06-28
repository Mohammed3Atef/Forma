import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import type { AppNotification, CoachClientRelationship } from '@/types';

const CLIENT = 'clientData';

/** Fields the caller supplies; id/timestamps are filled in here. */
export type NewNotification = Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt' | 'seenAt'>;

/**
 * Best-effort: writes an in-app notification at
 * `clientData/{clientId}/notifications/{id}`. A failed notification must NEVER
 * block the primary action that raised it (mirrors `writeAudit`). Only defined
 * fields are persisted (Firestore rejects `undefined`).
 */
export async function notify(n: NewNotification): Promise<void> {
  try {
    const { db } = ensureFirebase();
    const id = uid('ntf');
    const now = Date.now();
    const docData: Record<string, unknown> = {
      id,
      clientId: n.clientId,
      forRole: n.forRole,
      type: n.type,
      seenAt: null,
      createdAt: now,
      createdBy: n.createdBy,
      updatedAt: now,
    };
    for (const k of ['body', 'screen', 'date', 'entityType', 'entityId', 'route'] as const) {
      const v = n[k];
      if (v != null) docData[k] = v;
    }
    await setDoc(doc(db, CLIENT, n.clientId, 'notifications', id), docData);
  } catch (e) {
    console.warn('[notify] write failed (non-fatal):', e);
  }
}

/**
 * Notifications for one client doc, filtered by audience, newest first. Orders by
 * `createdAt` only (single-field auto-index — no composite index needed) and
 * filters `forRole` client-side; both audiences are small per client.
 */
export async function listNotifications(clientId: string, forRole: 'client' | 'coach', max = 50): Promise<AppNotification[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(
    query(collection(db, CLIENT, clientId, 'notifications'), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snap.docs.map((d) => d.data() as AppNotification).filter((n) => n.forRole === forRole);
}

/** Real-time notifications for one client doc, filtered by audience. Returns an unsubscribe. */
export function subscribeNotifications(
  clientId: string,
  forRole: 'client' | 'coach',
  cb: (items: AppNotification[]) => void,
  max = 50,
): () => void {
  const { db } = ensureFirebase();
  const qy = query(collection(db, CLIENT, clientId, 'notifications'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => d.data() as AppNotification).filter((n) => n.forRole === forRole));
  });
}

/**
 * Real-time coach-bound notifications across the coach's own doc + each active
 * client's doc (mirrors {@link listCoachNotifications}). Opens one listener per
 * doc and re-emits the merged, newest-first list on any change. The client set
 * is resolved once at subscribe time; the returned unsubscribe tears down every
 * child listener.
 */
export function subscribeCoachNotifications(coachId: string, cb: (items: AppNotification[]) => void, max = 50): () => void {
  const { db } = ensureFirebase();
  let cancelled = false;
  const unsubs: Array<() => void> = [];
  const byDoc = new Map<string, AppNotification[]>();
  const emit = () =>
    cb(
      Array.from(byDoc.values())
        .flat()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, max),
    );
  const subscribeOne = (cid: string) => {
    const qy = query(collection(db, CLIENT, cid, 'notifications'), orderBy('createdAt', 'desc'), limit(max));
    unsubs.push(
      onSnapshot(
        qy,
        (snap) => {
          byDoc.set(cid, snap.docs.map((d) => d.data() as AppNotification).filter((n) => n.forRole === 'coach'));
          emit();
        },
        () => undefined,
      ),
    );
  };
  subscribeOne(coachId); // the coach's own doc (self-addressed alerts)
  getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')))
    .then((relSnap) => {
      if (cancelled) return;
      for (const d of relSnap.docs) {
        const cid = (d.data() as CoachClientRelationship).clientId;
        if (cid !== coachId) subscribeOne(cid);
      }
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    unsubs.forEach((u) => u());
  };
}

/** Marks a single notification seen (read-state lives on the notification). */
export async function markNotificationSeen(clientId: string, id: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await setDoc(doc(db, CLIENT, clientId, 'notifications', id), { seenAt: now, updatedAt: now }, { merge: true });
}

/**
 * Marks all unread `message_received` notifications for one audience in a thread
 * seen — called when that party opens the thread so the bell/feed clear in sync
 * with the message read-state. Best-effort; no write when nothing is unread.
 */
export async function markMessageNotificationsSeen(clientId: string, forRole: 'client' | 'coach'): Promise<void> {
  try {
    const { db } = ensureFirebase();
    const snap = await getDocs(collection(db, CLIENT, clientId, 'notifications'));
    const unseen = snap.docs
      .map((d) => d.data() as AppNotification)
      .filter((n) => n.type === 'message_received' && n.forRole === forRole && !n.seenAt);
    if (unseen.length === 0) return;
    const now = Date.now();
    const batch = writeBatch(db);
    for (const n of unseen) batch.set(doc(db, CLIENT, clientId, 'notifications', n.id), { seenAt: now, updatedAt: now }, { merge: true });
    await batch.commit();
  } catch (e) {
    console.warn('[markMessageNotificationsSeen] failed (non-fatal):', e);
  }
}

/**
 * Coach-bound notifications across all the coach's active clients (the client
 * list is small, so per-client queries are fine and avoid a collectionGroup +
 * its rule complexity), PLUS the coach's OWN notifications doc — where alerts
 * about the coach themselves land (e.g. a plan-change decision written to
 * `clientData/{coachId}/notifications`, which the coach may read as the owner).
 * Each item carries its `clientId` for deep-linking.
 */
export async function listCoachNotifications(coachId: string, max = 50): Promise<AppNotification[]> {
  const { db } = ensureFirebase();
  // Active clients of this coach (inlined to avoid a coachClientsApi import cycle).
  const relSnap = await getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')));
  const clientIds = relSnap.docs.map((d) => (d.data() as CoachClientRelationship).clientId);
  const ids = [coachId, ...clientIds]; // the coach's own doc first (self-addressed alerts)
  const lists = await Promise.all(ids.map((cid) => listNotifications(cid, 'coach', max).catch(() => [])));
  return lists.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}
