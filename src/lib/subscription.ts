import type { Subscription, SubscriptionStatus } from '@/types';

const DAY = 86_400_000;

/**
 * Effective subscription state folding in the current date: a trial/active
 * term past `endAt` is `expired`; a freeze in force is `frozen`; otherwise
 * `active`/`trial`. Returns `none` when the coach hasn't set a subscription.
 *
 * Freezes (B3.0.1 / B3-S07, owner-approved): a freeze with `freezeCredit` is
 * SCHEDULED — frozen only while `frozenFrom <= now < frozenUntil`. A freeze
 * stored before B3.0.1 (no `freezeCredit`) keeps its original meaning (frozen
 * until `frozenUntil`, or indefinitely) — no silent migration. KEEP IDENTICAL
 * to `api/admin/_lib/subscription.ts` (shared vector: `subscriptionParity.test.ts`).
 */
export function effectiveSubscriptionStatus(
  sub: Subscription | null | undefined,
  now = Date.now(),
): SubscriptionStatus | 'none' {
  if (!sub) return 'none';
  if (sub.status === 'cancelled') return 'cancelled';
  if (sub.status === 'ended') return 'ended';
  if (sub.status === 'expired') return 'expired';
  if (sub.status === 'pending') return 'pending';
  if (sub.status === 'frozen') {
    if (sub.freezeCredit != null) {
      if (sub.frozenFrom != null && sub.frozenUntil != null && now >= sub.frozenFrom && now < sub.frozenUntil) return 'frozen';
    } else if (sub.frozenUntil == null || now < sub.frozenUntil) {
      return 'frozen';
    }
  }
  if (now >= sub.endAt) return 'expired'; // trial/active term lapsed
  return sub.status === 'trial' ? 'trial' : 'active';
}

/**
 * The end date an Unfreeze NOW would produce — shown to the coach before they
 * confirm (owner, B3.0.1). Mirrors `applyUnfreeze` in
 * `api/coach-clients/_subscriptionRules.ts` (parity test): a freeze that never
 * started gives all its days back; an early unfreeze keeps one compensated day
 * per started frozen day inside the term; a finished or pre-B3.0.1 freeze
 * leaves the end where it is.
 */
export function unfreezeEndAt(sub: Subscription, now = Date.now()): number {
  if (sub.status !== 'frozen' || sub.freezeCredit == null || sub.frozenFrom == null || sub.frozenUntil == null) return sub.endAt;
  if (now >= sub.frozenUntil) return sub.endAt;
  const used = Math.max(0, now - Math.max(sub.frozenFrom, sub.startAt));
  const kept = Math.min(sub.freezeCredit, Math.ceil(used / DAY) * DAY);
  return sub.endAt - (sub.freezeCredit - kept);
}

/** Mirrors the server's `isBackdatedRenewal`: a new term starting before today over unpaid time. */
export function isBackdatedRenewal(prev: Subscription | null | undefined, startAt: number, now = Date.now()): boolean {
  if (!(startAt < now - DAY)) return false;
  if (!prev) return true;
  const terminal = prev.status === 'expired' || prev.status === 'ended' || prev.status === 'cancelled' || prev.status === 'pending';
  return terminal || prev.endAt <= now || startAt < prev.startAt - DAY;
}

/** A freeze written since B3.0.1 (scheduled, compensated) whose window has not started yet. */
export function freezeScheduled(sub: Subscription | null | undefined, now = Date.now()): boolean {
  return !!sub && sub.status === 'frozen' && sub.freezeCredit != null && sub.frozenFrom != null && now < sub.frozenFrom;
}

/** A stored freeze that is scheduled or in force (the coach can still cancel / end it). */
export function freezePending(sub: Subscription | null | undefined, now = Date.now()): boolean {
  return !!sub && sub.status === 'frozen' && (sub.frozenUntil == null || now < sub.frozenUntil);
}

export type SubscriptionAccess = 'full' | 'limited' | 'readonly';

/**
 * Access the effective status grants the client:
 *  - full: trial / active
 *  - limited: pending / none (no proper subscription -> limited screen)
 *  - readonly: expired / cancelled / frozen / ended (plans view-only)
 */
export function subscriptionAccess(status: SubscriptionStatus | 'none'): SubscriptionAccess {
  if (status === 'trial' || status === 'active') return 'full';
  if (status === 'pending' || status === 'none') return 'limited';
  return 'readonly';
}

/** Whole days remaining in the term (0 once past). */
export function subscriptionDaysLeft(sub: Subscription | null | undefined, now = Date.now()): number {
  if (!sub) return 0;
  return Math.max(0, Math.ceil((sub.endAt - now) / DAY));
}

/** Calendar-accurate `startAt + months` → end timestamp. */
export function addMonths(startAt: number, months: number): number {
  const d = new Date(startAt);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}
