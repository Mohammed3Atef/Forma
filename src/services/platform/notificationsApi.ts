import { apiGet, apiPost } from '@/services/platformApi';
import type { AppNotification } from '@/types';

/**
 * Client for the Mongo-backed `/api/notifications*` routes. Firestore
 * `onSnapshot` listeners are replaced with `setInterval` + `apiGet` polling a
 * `since` cursor — see `pollFeed` below, which both "subscribe" exports share.
 * `GET /api/notifications` is already scoped to the AUTHENTICATED caller's own
 * feed (role-routed server-side — see `feedFilter` in `api/notifications/_data.ts`,
 * which merges a coach's own doc + every active client for a coach, or just a
 * client's own feed), so every function here is only ever called with the
 * signed-in user's own id in practice; the `clientId`/`coachId`/`forRole`
 * parameters are kept for signature compatibility with the Firestore-era
 * callers but aren't sent to the API.
 */

/** Fields the caller supplies; id/timestamps/seenAt are filled in here. */
export type NewNotification = Omit<AppNotification, 'id' | 'createdAt' | 'updatedAt' | 'seenAt'>;

/**
 * Best-effort: originally wrote an in-app notification straight to Firestore.
 * In the Mongo backend, notification-worthy actions create their own
 * notification server-side as part of the relevant action's own route (e.g.
 * sending a message — see `POST /api/messages`); there is no generic
 * `POST /api/notifications` route for the frontend to call directly. This
 * stays exported — and still never throws, matching the original best-effort
 * contract — purely so callers not yet migrated off Firestore (`coachApi.ts`,
 * `coachClientsApi.ts`, `coachPlanApi.ts`, `checkInApi.ts`, `coachTrialApi.ts`,
 * `clientCoachApi.ts`) keep compiling. Once each of those hits a dedicated
 * Mongo route that raises its own notification, this export — and their
 * imports of it — should be deleted.
 */
export async function notify(_n: NewNotification): Promise<void> {
  // Intentionally a no-op — see above.
}

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
function pollFeed(cb: (items: AppNotification[]) => void, max: number, intervalMs = NOTIF_POLL_MS): () => void {
  let cancelled = false;
  let cursor: number | undefined;
  let all: AppNotification[] = [];
  let tick = 0;

  const emit = () => cb(all.slice(0, max));

  const poll = async () => {
    const fullRefresh = cursor == null || tick % FULL_REFRESH_EVERY === 0;
    try {
      const page = await apiGet<NotificationsPage>(`/messages/notifications${fullRefresh ? '' : `?since=${cursor}`}`);
      if (cancelled) return;
      // Newest-first from the server; merge any new rows in front.
      all = fullRefresh ? page.notifications : page.notifications.length > 0 ? [...page.notifications, ...all] : all;
      cursor = all[0]?.createdAt;
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

/** Notifications for one client doc, filtered by audience, newest first. */
export async function listNotifications(
  _clientId: string,
  _forRole: 'client' | 'coach',
  max = 50,
): Promise<AppNotification[]> {
  const { notifications } = await apiGet<NotificationsPage>('/messages/notifications');
  return notifications.slice(0, max);
}

/** Polling notifications for one client doc, filtered by audience. Returns an unsubscribe. */
export function subscribeNotifications(
  _clientId: string,
  _forRole: 'client' | 'coach',
  cb: (items: AppNotification[]) => void,
  max = 50,
): () => void {
  return pollFeed(cb, max);
}

/**
 * Polling coach-bound notifications across the coach's own doc + each active
 * client's doc. The Firestore-era version opened one listener per doc and
 * merged them client-side; the Mongo `feedFilter` does that same merge
 * server-side, so this is just `pollFeed`.
 */
export function subscribeCoachNotifications(_coachId: string, cb: (items: AppNotification[]) => void, max = 50): () => void {
  return pollFeed(cb, max);
}

/** Marks a single notification seen (read-state lives on the notification). */
export async function markNotificationSeen(_clientId: string, id: string): Promise<void> {
  // `_clientId` is unused: `/notifications/mark-read` scopes to the caller's
  // own feed + the given `id` — no clientId needed. Kept for signature compatibility.
  await apiPost('/messages/notifications/mark-read', { id });
}

/**
 * Marks all unread `message_received` notifications for one audience in a
 * thread seen. The backend folds this into `/messages/mark-read` (mirrors
 * `markThreadSeen` in `messagesApi.ts` calling the same route) — best-effort,
 * never throws.
 */
export async function markMessageNotificationsSeen(clientId: string, _forRole: 'client' | 'coach'): Promise<void> {
  try {
    await apiPost('/messages/mark-read', { clientId });
  } catch (e) {
    console.warn('[markMessageNotificationsSeen] failed (non-fatal):', e);
  }
}

/**
 * Coach-bound notifications across all the coach's active clients + their own
 * doc — the one-shot counterpart to `subscribeCoachNotifications`.
 */
export async function listCoachNotifications(_coachId: string, max = 50): Promise<AppNotification[]> {
  const { notifications } = await apiGet<NotificationsPage>('/messages/notifications');
  return notifications.slice(0, max);
}
