import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore';
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

/** Marks a single notification seen (read-state lives on the notification). */
export async function markNotificationSeen(clientId: string, id: string): Promise<void> {
  const { db } = ensureFirebase();
  const now = Date.now();
  await setDoc(doc(db, CLIENT, clientId, 'notifications', id), { seenAt: now, updatedAt: now }, { merge: true });
}

/**
 * Coach-bound notifications across all the coach's active clients (the client
 * list is small, so per-client queries are fine and avoid a collectionGroup +
 * its rule complexity). Each item carries its `clientId` for deep-linking.
 */
export async function listCoachNotifications(coachId: string, max = 50): Promise<AppNotification[]> {
  const { db } = ensureFirebase();
  // Active clients of this coach (inlined to avoid a coachClientsApi import cycle).
  const relSnap = await getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')));
  const clientIds = relSnap.docs.map((d) => (d.data() as CoachClientRelationship).clientId);
  const lists = await Promise.all(clientIds.map((cid) => listNotifications(cid, 'coach', max).catch(() => [])));
  return lists.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, max);
}
