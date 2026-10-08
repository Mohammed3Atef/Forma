import { trpc } from '@/services/trpc';
import { shareSubscription } from '@/lib/sharedSubscription';
import type { AppNotification } from '@/types';

/**
 * Client for the Mongo-backed `trpc.notifications.*` procedures. Firestore
 * `onSnapshot` listeners are replaced with `setInterval` + polling a `since`
 * cursor — see `pollFeed` below, which both "subscribe" exports share.
 * `notifications.list` is already scoped to the AUTHENTICATED caller's own
 * feed (role-routed server-side — see `feedFilter` in
 * `api/messages/_handlers/notifications-data.ts`, which merges a coach's own
 * doc + every active client for a coach, or just a client's own feed), so
 * every function here is only ever called with the signed-in user's own id
 * in practice; the `clientId`/`coachId`/`forRole`
 * parameters are kept for signature compatibility with the Firestore-era
 * callers but aren't sent to the API.
 */


interface NotificationsPage {
  notifications: AppNotification[];
  unreadCount: number;
}

/** How often the notification bell/feed polls — a passive badge, not something stared at. */
const NOTIF_POLL_MS = 25_000;
/**
 * Every Nth tick, refetch the whole feed instead of just what's `since` the
 * last cursor, for the same reason `messagesApi`'s poller does: a `since` poll
 * only catches brand-new rows, never a `seenAt` flip on one it already has.
 */
const FULL_REFRESH_EVERY = 4;

/**
 * Shared poller behind every "subscribe" export below: the backend already
 * resolves "whose feed" from the auth token, so there's nothing here to branch
 * on by role/id — one implementation serves clients, coaches, and (via
 * `subscribeCoachNotifications`) what used to be a per-client fan-out of
 * listeners, now folded into the single server-side `feedFilter` query.
 */
function pollFeed(
  cb: (items: AppNotification[]) => void,
  max: number,
  intervalMs = NOTIF_POLL_MS,
  onError?: (failed: boolean) => void,
  exposePollNow?: (fn: () => void) => void,
): () => void {
  let cancelled = false;
  let cursor: number | undefined;
  let all: AppNotification[] = [];
  let tick = 0;

  const emit = () => cb(all.slice(0, max));

  const poll = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const fullRefresh = cursor == null || tick % FULL_REFRESH_EVERY === 0;
    try {
      const page: NotificationsPage = await trpc.notifications.list.query(fullRefresh ? undefined : { since: cursor });
      if (cancelled) return;
      // Newest-first from the server; merge any new rows in front.
      all = fullRefresh ? page.notifications : page.notifications.length > 0 ? [...page.notifications, ...all] : all;
      cursor = all[0]?.createdAt;
      tick += 1;
      emit();
      onError?.(false);
    } catch {
      // Transient network/API error — keep the last known state, retry next
      // tick; report it so a feed that never loaded shows an error, not a
      // spinner forever (B0.16).
      if (!cancelled) onError?.(true);
    }
  };

  void poll();
  // An immediate full refresh on demand (e.g. right after "Mark all read").
  exposePollNow?.(() => {
    tick = 0;
    void poll();
  });
  const interval = setInterval(() => void poll(), intervalMs);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

/** Polling notifications for one client doc, filtered by audience. Returns an unsubscribe. */
export function subscribeNotifications(
  clientId: string,
  _forRole: 'client' | 'coach',
  cb: (items: AppNotification[]) => void,
  max = 50,
  onError?: (failed: boolean) => void,
): () => void {
  return subscribeFeed(clientId, cb, max, onError);
}

/**
 * ONE poll loop per signed-in user, shared by every mounted bell / feed
 * (B0 / RM-82: the responsive shells mount two bells, each used to poll).
 */
interface FeedState {
  items: AppNotification[] | null;
  failed: boolean;
}
let feedPollNow: (() => void) | null = null;
function subscribeFeed(userId: string, cb: (items: AppNotification[]) => void, max: number, onError?: (failed: boolean) => void): () => void {
  return shareSubscription<FeedState>(
    `notif-feed:${userId}`,
    (emit) => {
      let items: AppNotification[] | null = null;
      const stop = pollFeed(
        (next) => {
          items = next;
          emit({ items, failed: false });
        },
        Math.max(max, 50),
        NOTIF_POLL_MS,
        (failed) => {
          if (failed) emit({ items, failed: true });
        },
        (fn) => {
          feedPollNow = fn;
        },
      );
      return () => {
        feedPollNow = null;
        stop();
      };
    },
    (state) => {
      if (state.items) cb(state.items.slice(0, max));
      onError?.(state.failed);
    },
  );
}

/** Poll the shared feed right now (after "Mark all read", or a Retry). */
export function refreshNotifications(): void {
  feedPollNow?.();
}

/**
 * Polling coach-bound notifications across the coach's own doc + each active
 * client's doc. The Firestore-era version opened one listener per doc and
 * merged them client-side; the Mongo `feedFilter` does that same merge
 * server-side, so this is just `pollFeed`.
 */
export function subscribeCoachNotifications(coachId: string, cb: (items: AppNotification[]) => void, max = 50, onError?: (failed: boolean) => void): () => void {
  return subscribeFeed(coachId, cb, max, onError);
}

/** Marks a single notification seen (read-state lives on the notification). */
export async function markNotificationSeen(_clientId: string, id: string): Promise<void> {
  // `_clientId` is unused: `notifications.markRead` scopes to the caller's
  // own feed + the given `id` — no clientId needed. Kept for signature compatibility.
  await trpc.notifications.markRead.mutate({ id });
}

/** "Mark all read" — every notification in the caller's own feed (B0 / NT-03). */
export async function markAllNotificationsSeen(): Promise<void> {
  await trpc.notifications.markRead.mutate({});
}

/**
 * Marks all unread `message_received` notifications for one audience in a
 * thread seen. The backend folds this into `/messages/mark-read` (mirrors
 * `markThreadSeen` in `messagesApi.ts` calling the same route) — best-effort,
 * never throws.
 */
export async function markMessageNotificationsSeen(clientId: string, _forRole: 'client' | 'coach'): Promise<void> {
  try {
    await trpc.messages.markRead.mutate({ clientId });
  } catch (e) {
    console.warn('[markMessageNotificationsSeen] failed (non-fatal):', e);
  }
}

