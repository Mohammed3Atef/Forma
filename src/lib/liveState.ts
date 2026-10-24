import { currentLocalOwner } from '@/data/localScope';

/**
 * In-progress activity that must survive a reload, an update reload or the OS
 * killing a backgrounded PWA (B0 / PWA-07): the live cardio timer, the rest
 * timer and the workout session's current exercise. Stored as timestamps (not
 * running counters) in localStorage — synchronous, so a write can't be lost to
 * a kill that lands before an async IndexedDB commit — and scoped to the
 * signed-in account.
 */
export interface LiveState {
  cardio?: { start: number; params: { speedKmh: number; inclinePct: number } | null } | null;
  rest?: { endsAt: number | null; totalSec: number; pausedRemaining: number | null } | null;
  session?: { logId: string; index: number } | null;
}

/** Anything older than this is a forgotten timer, not one to resume. */
export const LIVE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function key(): string | null {
  const uid = currentLocalOwner();
  return uid ? `forma.live.v1.${uid}` : null;
}

export function readLive(): LiveState {
  const k = key();
  if (!k) return {};
  try {
    return (JSON.parse(localStorage.getItem(k) ?? '{}') as LiveState) ?? {};
  } catch {
    return {};
  }
}

export function writeLive(patch: Partial<LiveState>): void {
  const k = key();
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify({ ...readLive(), ...patch }));
  } catch {
    /* storage unavailable — the activity just won't survive a reload */
  }
}
