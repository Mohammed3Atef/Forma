import type { AppNotification, NotificationType } from '@/types';

/**
 * Notification taxonomy (B1.9) — the one table that says, for every type,
 * who it is for, what kind of thing it is, how rows group in the feed and
 * whether the server produces it today. The feed, the bell and the deep-link
 * resolver all read this; `notificationTaxonomy.test.ts` keeps it equal to the
 * server's list (`api/_lib/notificationTypes.ts`).
 *
 *  - task:    asks the reader to do something; the server RESOLVES it when
 *             that thing is done (check-in submitted, request decided…).
 *  - message: a chat message — counted by the Messages badge, never the bell.
 *  - update:  something changed that the reader may want to see.
 *  - account: about the reader's own account / plan.
 */
export type NotificationCategory = 'task' | 'message' | 'update' | 'account';

export interface NotificationKind {
  audience: 'client' | 'coach' | 'admin';
  category: NotificationCategory;
  /** The server raises this type today. `false` = reserved: renders if it ever arrives, but nothing produces it yet. */
  produced: boolean;
  /** Rows with the same key collapse into ONE feed row (newest kept). Default: the row's own id. */
  coalesceBy?: 'thread';
}

export const NOTIFICATION_TAXONOMY: Record<NotificationType, NotificationKind> = {
  // → client
  coach_note: { audience: 'client', category: 'update', produced: true },
  targets_updated: { audience: 'client', category: 'update', produced: true },
  measurement_added: { audience: 'client', category: 'update', produced: true },
  checkin_requested: { audience: 'client', category: 'task', produced: true },
  checkin_reviewed: { audience: 'client', category: 'update', produced: true },
  freeze_decided: { audience: 'client', category: 'account', produced: true },
  assessment_reviewed: { audience: 'client', category: 'update', produced: true },
  plan_assigned: { audience: 'client', category: 'update', produced: false },
  subscription_updated: { audience: 'client', category: 'account', produced: false },
  // → coach
  checkin_submitted: { audience: 'coach', category: 'task', produced: true },
  assessment_submitted: { audience: 'coach', category: 'task', produced: true },
  freeze_requested: { audience: 'coach', category: 'task', produced: true },
  trial_expiring: { audience: 'coach', category: 'account', produced: false },
  plan_decided: { audience: 'coach', category: 'account', produced: false },
  coach_assigned: { audience: 'coach', category: 'update', produced: false },
  client_released: { audience: 'coach', category: 'update', produced: false },
  // → admin (synthesized from pending plan requests, see useNotifications)
  plan_change_requested: { audience: 'admin', category: 'task', produced: true },
  // → either party
  message_received: { audience: 'client', category: 'message', produced: true, coalesceBy: 'thread' },
};

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_TAXONOMY) as NotificationType[];

export function kindOf(type: NotificationType | string): NotificationKind | undefined {
  return (NOTIFICATION_TAXONOMY as Record<string, NotificationKind>)[type];
}

/** One feed row: a notification, or a group of them collapsed by the taxonomy. */
export interface FeedRow {
  rep: AppNotification;
  count: number;
  unseen: boolean;
  unreadCount: number;
}

function coalesceKey(n: AppNotification): string {
  return kindOf(n.type)?.coalesceBy === 'thread' ? `thread:${n.forRole}:${n.clientId}` : `id:${n.id}`;
}

/** Collapse a newest-first feed into rows (newest of each group kept, order preserved). */
export function coalesceFeed(items: AppNotification[]): FeedRow[] {
  const out: FeedRow[] = [];
  const at = new Map<string, number>();
  for (const n of items) {
    const unread = n.seenAt ? 0 : 1;
    const key = coalesceKey(n);
    const idx = at.get(key);
    if (idx == null) {
      at.set(key, out.length);
      out.push({ rep: n, count: 1, unseen: !n.seenAt, unreadCount: unread });
    } else {
      out[idx].count += 1;
      out[idx].unreadCount += unread;
      out[idx].unseen = out[idx].unseen || !n.seenAt;
    }
  }
  return out;
}

/**
 * The bell's number: unseen feed ROWS (what the feed shows, after grouping),
 * excluding chat messages — those are counted once, by the Messages badge.
 */
export function bellCount(items: AppNotification[]): number {
  return coalesceFeed(items).filter((r) => r.unseen && kindOf(r.rep.type)?.category !== 'message').length;
}
