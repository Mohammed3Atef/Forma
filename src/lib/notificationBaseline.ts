import type { AppNotification } from '@/types';

/**
 * Which notifications deserve a TOAST (B0 / NT-01). A toast is for something
 * that just happened — never the backlog. "New" is judged against a per-user
 * high-water mark stored on the device (it survives reloads, relaunches and
 * update reloads, unlike the old in-memory baseline that reset on every open)
 * and a short recency window, so a feed that hasn't been polled for days
 * can't burst on the next open either. The badge alone signals older items.
 */
export const TOAST_WINDOW_MS = 10 * 60_000;

const key = (uid: string) => `forma.notifToastMark.v1.${uid}`;

function readMark(uid: string): number | null {
  try {
    const v = localStorage.getItem(key(uid));
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}
function writeMark(uid: string, at: number): void {
  try {
    localStorage.setItem(key(uid), String(at));
  } catch {
    /* storage unavailable — worst case: no toasts, never a replay */
  }
}

/**
 * Call after every SUCCESSFUL poll with the loaded feed. Returns the rows to
 * toast and advances the mark. The first poll ever on this device only sets
 * the baseline (no toasts).
 */
export function pickToastable(uid: string, items: AppNotification[], now = Date.now()): AppNotification[] {
  const newest = items.reduce((m, n) => Math.max(m, n.createdAt), 0);
  const mark = readMark(uid);
  if (mark == null || Number.isNaN(mark)) {
    writeMark(uid, Math.max(newest, now));
    return [];
  }
  const fresh = items.filter((n) => n.createdAt > mark && !n.seenAt && !n.resolvedAt && now - n.createdAt <= TOAST_WINDOW_MS);
  if (newest > mark) writeMark(uid, newest);
  return fresh;
}
