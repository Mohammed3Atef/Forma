import { trpc } from '@/services/trpc';
import { shareSubscription } from '@/lib/sharedSubscription';
import type { Message, MessageAttachment, MessageCategory, Role } from '@/types';

/**
 * Client for the Mongo-backed `trpc.messages.*`/`trpc.notifications.*`
 * procedures. The Firestore `onSnapshot` realtime listeners this module used
 * to hold are replaced with `setInterval` + polling a `since` cursor (Vercel
 * serverless can't hold a WebSocket) — see `subscribeMessages` below, which
 * every other "subscribe" export in this file is built on top of. Every
 * export keeps its original name + signature so `MessageThread`,
 * `CoachMessages`, and `useCoachMessageUnread` need no changes.
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

/** True while the tab is hidden — every poll loop in this file skips its tick then, instead of burning battery/data on a screen nobody's looking at. */
function isTabHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

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
  const { messages } = await trpc.messages.list.query({ clientId });
  const flagged = messages.map(withBroadcastFlag);
  return flagged.slice(Math.max(0, flagged.length - max));
}

/**
 * Polling replacement for the old Firestore listener: fetches the thread on an
 * interval and re-emits the (trimmed) list, oldest first. Returns an
 * unsubscribe that stops the interval — callable exactly as before, but also
 * carries a `.patch()` method (see `MessageSubscription`) so a caller whose
 * own mutation (react/edit/delete) just changed a message locally can update
 * THIS loop's internal `all` cache too. Without that, the very next poll
 * tick emits `all` unchanged — a `since`-cursor tick never re-fetches an
 * already-seen message just because its `reactions`/`body`/`deletedAt`
 * changed, only `createdAt` moving the cursor forward — which overwrites the
 * caller's local update back to the old state until the next full-refresh
 * tick (up to `FULL_REFRESH_EVERY` ticks later) catches it up again. That
 * revert-then-restore is exactly the "reaction added, disappears, comes back
 * a few seconds later" symptom.
 */
export interface MessageSubscription {
  (): void;
  /** Patch one message in this loop's own cache so the next poll tick doesn't emit a stale copy over a just-applied local change. */
  patch: (id: string, updated: Message) => void;
}

export function subscribeMessages(
  clientId: string,
  cb: (msgs: Message[]) => void,
  max = 200,
  intervalMs = THREAD_POLL_MS,
  /** Called when a poll fails before any successful load (so the thread can show an error instead of loading forever). Polling keeps retrying. */
  onError?: () => void,
  /** Skip this tick (someone else is already fetching the same data). The tick after a skip refetches the whole window. */
  skipTick?: () => boolean,
): MessageSubscription {
  let cancelled = false;
  let cursor: number | undefined;
  let all: Message[] = [];
  let tick = 0;
  let resync = false;

  const emit = () => cb(all.slice(Math.max(0, all.length - max)));

  const poll = async () => {
    if (isTabHidden()) return;
    if (skipTick?.()) {
      resync = true; // read receipts may have changed meanwhile — a `since` poll wouldn't see them
      return;
    }
    const fullRefresh = cursor == null || resync || tick % FULL_REFRESH_EVERY === 0;
    try {
      const page: MessagesPage = await trpc.messages.list.query(fullRefresh ? { clientId } : { clientId, since: cursor });
      if (cancelled) return;
      const incoming = page.messages.map(withBroadcastFlag);
      all = fullRefresh ? incoming : [...all, ...incoming];
      cursor = page.cursor;
      if (fullRefresh) resync = false;
      tick += 1;
      emit();
    } catch {
      // Transient network/API error — keep the last known state, retry next tick.
      if (!cancelled && tick === 0) onError?.();
    }
  };

  void poll();
  const interval = setInterval(() => void poll(), intervalMs);
  const unsubscribe = (() => {
    cancelled = true;
    clearInterval(interval);
  }) as MessageSubscription;
  unsubscribe.patch = (id, updated) => {
    const idx = all.findIndex((m) => m.id === id);
    if (idx !== -1) all = [...all.slice(0, idx), updated, ...all.slice(idx + 1)];
  };
  return unsubscribe;
}

/**
 * Send a message into a client's thread and return the SERVER-ASSIGNED
 * message (with its real, stable `id`) — the caller reconciles its local
 * optimistic/temp id against this, never against body-text matching. Pass
 * `clientMsgId` (a client-generated id) to make retries idempotent: sending
 * the same `clientMsgId` twice returns the already-inserted message instead
 * of creating a duplicate. The backend best-effort notifies the recipient
 * itself — no client-side follow-up needed.
 */
export async function sendMessage(
  clientId: string,
  _from: { id: string; role: Role },
  body: string,
  opts?: { category?: MessageCategory; broadcast?: boolean; attachment?: MessageAttachment; clientMsgId?: string; /** B3.0.1: the conversation it was written in. */ coachId?: string },
): Promise<Message> {
  // `_from` is unused: the backend derives the sender's id + role from the
  // authenticated session, not the request body. Kept so this signature (and
  // every call site) doesn't need to change.
  const doc = await trpc.messages.send.mutate({
    clientId,
    text: body.trim(),
    ...(opts?.category ? { category: opts.category } : {}),
    ...(opts?.attachment ? { attachment: opts.attachment } : {}),
    ...(opts?.clientMsgId ? { clientMsgId: opts.clientMsgId } : {}),
    ...(opts?.coachId ? { coachId: opts.coachId } : {}),
  });
  return withBroadcastFlag(doc as Message);
}

/** Edit the sender's own message — server rejects past the 2-minute window or if the caller isn't the sender. */
export async function editMessage(clientId: string, id: string, text: string): Promise<Message> {
  const doc = await trpc.messages.edit.mutate({ clientId, id, text: text.trim() });
  return withBroadcastFlag(doc as Message);
}

/** Soft-delete the sender's own message (tombstone) — same 2-minute/ownership enforcement as `editMessage`. */
export async function deleteMessage(clientId: string, id: string): Promise<Message> {
  const doc = await trpc.messages.delete.mutate({ clientId, id });
  return withBroadcastFlag(doc as Message);
}

/** Set (or, with `value: null`, remove) the caller's own reaction on a message. Either thread member may react. */
export async function reactToMessage(clientId: string, id: string, value: string | null): Promise<Message> {
  const doc = await trpc.messages.react.mutate({ clientId, id, value: value as never });
  return withBroadcastFlag(doc as Message);
}

/** One older page of a thread, strictly before `before` (epoch ms) — for "load older" above the live 200-message window. */
export async function listOlderMessages(clientId: string, before: number): Promise<{ messages: Message[]; hasMore: boolean }> {
  const page = await trpc.messages.list.query({ clientId, before });
  return { messages: page.messages.map(withBroadcastFlag), hasMore: !!page.hasMore };
}

/*
 * Open threads (B1.13): while `MessageThread` polls a thread every 5 s, the
 * passive badge poll for that same thread skips its own 200-message fetch and
 * takes the open thread's data instead.
 */
const openThreads = new Map<string, number>();
const openThreadLast = new Map<string, Message[]>();
const openThreadWatchers = new Map<string, Set<(msgs: Message[]) => void>>();

/** The actively-open thread's poll (5 s). Its data also feeds that thread's unread badge. */
export function subscribeOpenThread(clientId: string, cb: (msgs: Message[]) => void, onError?: () => void): MessageSubscription {
  openThreads.set(clientId, (openThreads.get(clientId) ?? 0) + 1);
  const sub = subscribeMessages(
    clientId,
    (msgs) => {
      openThreadLast.set(clientId, msgs);
      cb(msgs);
      openThreadWatchers.get(clientId)?.forEach((w) => w(msgs));
    },
    200,
    THREAD_POLL_MS,
    onError,
  );
  const unsubscribe = (() => {
    sub();
    const n = (openThreads.get(clientId) ?? 1) - 1;
    if (n > 0) openThreads.set(clientId, n);
    else {
      openThreads.delete(clientId);
      openThreadLast.delete(clientId);
    }
  }) as MessageSubscription;
  unsubscribe.patch = sub.patch;
  return unsubscribe;
}

/** Mark messages from the OTHER party as seen (the reader just opened the thread). */
export async function markThreadSeen(clientId: string, _readerRole: Role): Promise<void> {
  // `_readerRole` is unused: the backend infers the reader's role from the
  // authenticated session. Kept for signature compatibility.
  await trpc.messages.markRead.mutate({ clientId });
}

export interface ThreadMeta {
  last: Message | null;
  unreadForCoach: number;
  unreadForClient: number;
}

/** Polling thread meta (last message + unread counts) for inbox rows. Returns an unsubscribe. */
export function subscribeThreadMeta(clientId: string, cb: (meta: ThreadMeta) => void): () => void {
  // Shared: the client's bottom nav and nav sheet both show this badge (B0 / RM-82).
  return shareSubscription<ThreadMeta>(`thread-meta:${clientId}`, (emit) => threadMetaPoll(clientId, emit), cb);
}

function threadMetaPoll(clientId: string, cb: (meta: ThreadMeta) => void): () => void {
  const toMeta = (msgs: Message[]) =>
    cb({
      last: msgs[msgs.length - 1] ?? null,
      unreadForCoach: msgs.filter((m) => m.fromRole === 'client' && !m.seenAt).length,
      unreadForClient: msgs.filter((m) => m.fromRole !== 'client' && !m.seenAt).length,
    });
  let watchers = openThreadWatchers.get(clientId);
  if (!watchers) openThreadWatchers.set(clientId, (watchers = new Set()));
  watchers.add(toMeta);
  const last = openThreadLast.get(clientId);
  if (last) toMeta(last);
  const stop = subscribeMessages(clientId, toMeta, 200, BADGE_POLL_MS, undefined, () => openThreads.has(clientId));
  return () => {
    watchers.delete(toMeta);
    if (watchers.size === 0) openThreadWatchers.delete(clientId);
    stop();
  };
}

export interface CoachThreadSummary {
  clientId: string;
  last: Message | null;
  unreadForCoach: number;
}

/**
 * Last message + unread-for-coach count across EVERY one of a coach's active
 * threads, in a single request (`messages.coachThreadsSummary` computes it
 * server-side with one aggregation). Backs both the inbox list's per-row
 * previews and the coach's total-unread badge — previously each of those
 * opened one polling subscription per client thread (fetching that thread's
 * full 200-message history on every tick just to derive a count).
 */
export async function coachThreadsSummary(coachId: string): Promise<CoachThreadSummary[]> {
  const rows = await trpc.messages.coachThreadsSummary.query({ coachId });
  return rows.map((r) => ({ ...r, last: r.last ? withBroadcastFlag(r.last as Message) : null }));
}

// `subscribeCoachThreadsSummary` has 2+ independent subscribers per coach in
// practice (the inbox list's own call + `useCoachMessageUnread`'s nav-badge
// call, both wanting the same coachId) — without this, each opened its own
// interval hitting the identical endpoint. Multiplexed by coachId so N
// subscribers share ONE interval/request; the last fetch replays immediately
// to a newly-added subscriber instead of it waiting a full tick.
interface SummaryMuxEntry {
  timer: ReturnType<typeof setInterval>;
  listeners: Set<(rows: CoachThreadSummary[]) => void>;
  errorListeners: Set<(failed: boolean) => void>;
  lastRows: CoachThreadSummary[] | null;
  /** The latest tick failed (cleared by the next success). */
  failed: boolean;
  poll: () => Promise<void>;
}
const summaryMux = new Map<string, SummaryMuxEntry>();

/**
 * Polling version of `coachThreadsSummary` — one interval, one request per tick, shared across every subscriber for the same coach.
 * `onError` (B3.2, optional) hears whether the latest tick failed, so a screen can tell "no unread" from "couldn't load".
 */
export function subscribeCoachThreadsSummary(
  coachId: string,
  cb: (rows: CoachThreadSummary[]) => void,
  intervalMs = BADGE_POLL_MS,
  onError?: (failed: boolean) => void,
): () => void {
  let entry = summaryMux.get(coachId);
  if (!entry) {
    const listeners = new Set<(rows: CoachThreadSummary[]) => void>();
    const newEntry: SummaryMuxEntry = { listeners, errorListeners: new Set(), lastRows: null, failed: false, poll: async () => undefined, timer: null as unknown as ReturnType<typeof setInterval> };
    const setFailed = (failed: boolean) => {
      if (newEntry.failed === failed) return;
      newEntry.failed = failed;
      newEntry.errorListeners.forEach((l) => l(failed));
    };
    const poll = async () => {
      if (isTabHidden()) return;
      try {
        const rows = await coachThreadsSummary(coachId);
        newEntry.lastRows = rows;
        setFailed(false);
        newEntry.listeners.forEach((l) => l(rows));
      } catch {
        // Transient network/API error — keep the last known state, retry next tick.
        setFailed(true);
      }
    };
    newEntry.poll = poll;
    newEntry.timer = setInterval(() => void poll(), intervalMs);
    entry = newEntry;
    summaryMux.set(coachId, entry);
    void poll();
  }
  entry.listeners.add(cb);
  if (onError) {
    entry.errorListeners.add(onError);
    if (entry.failed) onError(true);
  }
  if (entry.lastRows) cb(entry.lastRows);
  return () => {
    entry!.listeners.delete(cb);
    if (onError) entry!.errorListeners.delete(onError);
    if (entry!.listeners.size === 0) {
      clearInterval(entry!.timer);
      summaryMux.delete(coachId);
    }
  };
}

/** Run the shared summary poll now (a screen's Refresh / Retry); no-op when nothing subscribes. */
export function refreshCoachThreadsSummary(coachId: string): Promise<void> {
  return summaryMux.get(coachId)?.poll() ?? Promise.resolve();
}

/** Total unread messages addressed to the coach across all their client threads. */
export async function coachUnreadCount(coachId: string): Promise<number> {
  const rows = await coachThreadsSummary(coachId);
  return rows.reduce((sum, r) => sum + r.unreadForCoach, 0);
}

/** Polling total of unread client→coach messages across all the coach's active threads. */
export function subscribeCoachUnread(coachId: string, cb: (total: number) => void): () => void {
  // Shared: the bottom nav and the sidebar both show this badge (B0 / RM-82).
  return shareSubscription<number>(
    `coach-unread:${coachId}`,
    (emit) => subscribeCoachThreadsSummary(coachId, (rows) => emit(rows.reduce((sum, r) => sum + r.unreadForCoach, 0))),
    cb,
  );
}

/** Send a broadcast message to many clients' threads (announcement/offer/reminder/update). */
export async function broadcast(clientIds: string[], from: { id: string; role: Role }, body: string, category: MessageCategory): Promise<void> {
  await Promise.all(clientIds.map((cid) => sendMessage(cid, from, body, { category, broadcast: true })));
}
