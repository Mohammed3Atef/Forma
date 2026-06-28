import { collection, doc, getDocs, onSnapshot, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { uid } from '@/lib/utils';
import { notify } from './notificationsApi';
import type { CoachClientRelationship, Message, MessageAttachment, MessageCategory, Role } from '@/types';

const CLIENT = 'clientData';
const COLL = 'messages';

/** Messages in a client's 1:1 thread, oldest first. */
export async function listMessages(clientId: string, max = 200): Promise<Message[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, CLIENT, clientId, COLL), orderBy('createdAt', 'asc')));
  const all = snap.docs.map((d) => d.data() as Message);
  return all.slice(Math.max(0, all.length - max));
}

/** Real-time listener for a client's thread (oldest first). Returns an unsubscribe. */
export function subscribeMessages(clientId: string, cb: (msgs: Message[]) => void, max = 200): () => void {
  const { db } = ensureFirebase();
  const qy = query(collection(db, CLIENT, clientId, COLL), orderBy('createdAt', 'asc'));
  return onSnapshot(qy, (snap) => {
    const all = snap.docs.map((d) => d.data() as Message);
    cb(all.slice(Math.max(0, all.length - max)));
  });
}

/** Send a message into a client's thread + notify the recipient. */
export async function sendMessage(
  clientId: string,
  from: { id: string; role: Role },
  body: string,
  opts?: { category?: MessageCategory; broadcast?: boolean; attachment?: MessageAttachment },
): Promise<void> {
  const { db } = ensureFirebase();
  const id = uid('msg');
  const now = Date.now();
  const doc_: Record<string, unknown> = {
    id,
    clientId,
    fromUserId: from.id,
    fromRole: from.role,
    body: body.trim(),
    seenAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (opts?.category) doc_.category = opts.category;
  if (opts?.broadcast) doc_.broadcast = true;
  if (opts?.attachment) doc_.attachment = opts.attachment;
  await setDoc(doc(db, CLIENT, clientId, COLL, id), doc_);
  const toCoach = from.role !== 'coach';
  // Preview text: the message body, else the attachment kind.
  const preview = body.trim() || (opts?.attachment ? `📎 ${opts.attachment.name ?? opts.attachment.kind}` : '');
  await notify({
    clientId,
    forRole: toCoach ? 'coach' : 'client',
    type: 'message_received',
    body: preview.slice(0, 140),
    route: toCoach ? `/coach/messages/${clientId}` : '/messages',
    createdBy: from.id,
  });
}

/** Mark messages from the OTHER party as seen (the reader just opened the thread). */
export async function markThreadSeen(clientId: string, readerRole: Role): Promise<void> {
  const { db } = ensureFirebase();
  const msgs = await listMessages(clientId);
  const unseen = msgs.filter((m) => m.fromRole !== readerRole && !m.seenAt);
  if (unseen.length === 0) return;
  const now = Date.now();
  const batch = writeBatch(db);
  for (const m of unseen) batch.set(doc(db, CLIENT, clientId, COLL, m.id), { seenAt: now }, { merge: true });
  await batch.commit();
}

export interface ThreadMeta {
  last: Message | null;
  unreadForCoach: number;
  unreadForClient: number;
}

/** Last message + unread counts for a thread (for inbox rows / badges). */
export async function threadMeta(clientId: string): Promise<ThreadMeta> {
  const msgs = await listMessages(clientId);
  return {
    last: msgs[msgs.length - 1] ?? null,
    unreadForCoach: msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length,
    unreadForClient: msgs.filter((m) => m.fromRole !== 'client' && !m.seenAt).length,
  };
}

/** Real-time thread meta (last message + unread counts) for inbox rows. Returns an unsubscribe. */
export function subscribeThreadMeta(clientId: string, cb: (meta: ThreadMeta) => void): () => void {
  return subscribeMessages(clientId, (msgs) => {
    cb({
      last: msgs[msgs.length - 1] ?? null,
      unreadForCoach: msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length,
      unreadForClient: msgs.filter((m) => m.fromRole !== 'client' && !m.seenAt).length,
    });
  });
}

/** Active client ids for a coach (inlined to avoid a coachClientsApi import cycle). */
export async function coachClientIds(coachId: string): Promise<string[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')));
  return snap.docs.map((d) => (d.data() as CoachClientRelationship).clientId);
}

/** Total unread messages addressed to the coach across all their client threads. */
export async function coachUnreadCount(coachId: string): Promise<number> {
  const ids = await coachClientIds(coachId);
  const metas = await Promise.all(ids.map((id) => threadMeta(id)));
  return metas.reduce((sum, m) => sum + m.unreadForCoach, 0);
}

/**
 * Real-time total of unread client→coach messages across all the coach's active
 * threads. Resolves the client set once, then keeps one live listener per thread
 * and re-emits the live sum. Returns an unsubscribe that tears down every child.
 */
export function subscribeCoachUnread(coachId: string, cb: (total: number) => void): () => void {
  let cancelled = false;
  const unsubs: Array<() => void> = [];
  const byClient = new Map<string, number>();
  const emit = () => cb(Array.from(byClient.values()).reduce((sum, n) => sum + n, 0));
  coachClientIds(coachId)
    .then((ids) => {
      if (cancelled) return;
      if (ids.length === 0) return emit();
      for (const id of ids) {
        unsubs.push(
          subscribeMessages(id, (msgs) => {
            byClient.set(id, msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length);
            emit();
          }),
        );
      }
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    unsubs.forEach((u) => u());
  };
}

/** Send a broadcast message to many clients' threads (announcement/offer/reminder/update). */
export async function broadcast(clientIds: string[], from: { id: string; role: Role }, body: string, category: MessageCategory): Promise<void> {
  await Promise.all(clientIds.map((cid) => sendMessage(cid, from, body, { category, broadcast: true })));
}
