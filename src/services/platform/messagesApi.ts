import { apiGet, apiPost } from '@/services/platformApi';
import type { Message, MessageAttachment, MessageCategory, Role } from '@/types';

/**
 * Client for the Mongo-backed `/api/messages*` routes. The Firestore
 * `onSnapshot` realtime listeners this module used to hold are replaced with
 * `setInterval` + `apiGet` polling a `since` cursor (Vercel serverless can't
 * hold a WebSocket) — see `subscribeMessages` below, which every other
 * "subscribe" export in this file is built on top of. Every export keeps its
 * original name + signature so `MessageThread`, `CoachMessages`, and
 * `useCoachMessageUnread` need no changes.
 */

interface MessagesPage {
  messages: Message[];
  cursor: number;
}

/** How often the actively-open 1:1 thread (`MessageThread`) polls for new messages. */
const THREAD_POLL_MS = 5_000;
/** How often a passive per-row / aggregate unread signal (inbox previews, the
 *  coach's total-unread badge) polls — nobody's staring at these every second. */
const BADGE_POLL_MS = 20_000;
/**
 * Every Nth tick, refetch the whole window instead of just what's `since` the
 * last cursor. A `since` poll only catches brand-new rows (`createdAt` after
 * the cursor); it would never see a READ RECEIPT flip (`seenAt` set) on a
 * message it already fetched, since that update doesn't change `createdAt`.
 * Bounding that staleness to a few ticks keeps "Sent"/"Seen" honest without
 * giving up the bandwidth savings of `since` most of the time.
 */
const FULL_REFRESH_EVERY = 4;

/**
 * The backend's `POST /messages` (`SendBody`) has no `broadcast` field — only
 * `category` — so it's synthesized on read: in this app `category` is set
 * ONLY on broadcast sends (see `broadcast()` below; a plain 1:1 message never
 * sets it), so "has a category" is an exact stand-in for `broadcast`. This
 * keeps `MessageThread`'s existing `m.broadcast && m.category` render check
 * working unchanged.
 */
function withBroadcastFlag(m: Message): Message {
  return m.category ? { ...m, broadcast: true } : m;
}

/** Messages in a client's 1:1 thread, oldest first. */
export async function listMessages(clientId: string, max = 200): Promise<Message[]> {
  const { messages } = await apiGet<MessagesPage>(`/messages?clientId=${encodeURIComponent(clientId)}`);
  const flagged = messages.map(withBroadcastFlag);
  return flagged.slice(Math.max(0, flagged.length - max));
}

/**
 * Polling replacement for the old Firestore listener: fetches the thread on an
 * interval and re-emits the (trimmed) list, oldest first. Returns an
 * unsubscribe that stops the interval.
 */
export function subscribeMessages(
  clientId: string,
  cb: (msgs: Message[]) => void,
  max = 200,
  intervalMs = THREAD_POLL_MS,
): () => void {
  let cancelled = false;
  let cursor: number | undefined;
  let all: Message[] = [];
  let tick = 0;

  const emit = () => cb(all.slice(Math.max(0, all.length - max)));

  const poll = async () => {
    const fullRefresh = cursor == null || tick % FULL_REFRESH_EVERY === 0;
    try {
      const qs = fullRefresh ? '' : `&since=${cursor}`;
      const page = await apiGet<MessagesPage>(`/messages?clientId=${encodeURIComponent(clientId)}${qs}`);
      if (cancelled) return;
      const incoming = page.messages.map(withBroadcastFlag);
      all = fullRefresh ? incoming : [...all, ...incoming];
      cursor = page.cursor;
      tick += 1;
      emit();
    } catch {
      // Transient network/API error — keep the last known state, retry next tick.
    }
  };

  void poll();
  const interval = setInterval(() => void poll(), intervalMs);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

/**
 * Send a message into a client's thread. The backend best-effort notifies the
 * recipient itself (see `POST /api/messages`) — no client-side follow-up needed.
 */
export async function sendMessage(
  clientId: string,
  _from: { id: string; role: Role },
  body: string,
  opts?: { category?: MessageCategory; broadcast?: boolean; attachment?: MessageAttachment },
): Promise<void> {
  // `_from` is unused: the backend derives the sender's id + role from the
  // authenticated session, not the request body. Kept so this signature (and
  // every call site) doesn't need to change.
  await apiPost('/messages', {
    clientId,
    text: body.trim(),
    ...(opts?.category ? { category: opts.category } : {}),
    ...(opts?.attachment ? { attachment: opts.attachment } : {}),
  });
}

/** Mark messages from the OTHER party as seen (the reader just opened the thread). */
export async function markThreadSeen(clientId: string, _readerRole: Role): Promise<void> {
  // `_readerRole` is unused: the backend infers the reader's role from the
  // authenticated session. Kept for signature compatibility.
  await apiPost('/messages/mark-read', { clientId });
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

/** Polling thread meta (last message + unread counts) for inbox rows. Returns an unsubscribe. */
export function subscribeThreadMeta(clientId: string, cb: (meta: ThreadMeta) => void): () => void {
  return subscribeMessages(
    clientId,
    (msgs) => {
      cb({
        last: msgs[msgs.length - 1] ?? null,
        unreadForCoach: msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length,
        unreadForClient: msgs.filter((m) => m.fromRole !== 'client' && !m.seenAt).length,
      });
    },
    200,
    BADGE_POLL_MS,
  );
}

/** Active client ids for a coach (via `/api/coach-clients`, mirrors the old inlined Firestore query). */
export async function coachClientIds(coachId: string): Promise<string[]> {
  const rels = await apiGet<Array<{ clientId: string }>>(
    `/coach-clients?coachId=${encodeURIComponent(coachId)}&status=active`,
  );
  return rels.map((r) => r.clientId);
}

/** Total unread messages addressed to the coach across all their client threads. */
export async function coachUnreadCount(coachId: string): Promise<number> {
  const ids = await coachClientIds(coachId);
  const metas = await Promise.all(ids.map((id) => threadMeta(id)));
  return metas.reduce((sum, m) => sum + m.unreadForCoach, 0);
}

/**
 * Polling total of unread client→coach messages across all the coach's active
 * threads. Resolves the client set once, then keeps one poller per thread and
 * re-emits the live sum. Returns an unsubscribe that tears down every child.
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
          subscribeMessages(
            id,
            (msgs) => {
              byClient.set(id, msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length);
              emit();
            },
            200,
            BADGE_POLL_MS,
          ),
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
