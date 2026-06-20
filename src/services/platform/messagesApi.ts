import { collection, doc, getDocs, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore';
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

/** Active client ids for a coach (inlined to avoid a coachClientsApi import cycle). */
export async function coachClientIds(coachId: string): Promise<string[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')));
  return snap.docs.map((d) => (d.data() as CoachClientRelationship).clientId);
}

/** Send a broadcast message to many clients' threads (announcement/offer/reminder/update). */
export async function broadcast(clientIds: string[], from: { id: string; role: Role }, body: string, category: MessageCategory): Promise<void> {
  await Promise.all(clientIds.map((cid) => sendMessage(cid, from, body, { category, broadcast: true })));
}
