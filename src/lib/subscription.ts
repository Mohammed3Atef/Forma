import type { Subscription, SubscriptionStatus } from '@/types';

const DAY = 86_400_000;

/**
 * Effective subscription state folding in the current date: a term past `endAt`
 * is `ended`; a freeze whose `frozenUntil` hasn't passed is `frozen`; otherwise
 * `active`. Returns `none` when the coach hasn't set a subscription (no gating).
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
  if (sub.status === 'frozen' && (sub.frozenUntil == null || now < sub.frozenUntil)) return 'frozen';
  if (now >= sub.endAt) return 'expired'; // trial/active term lapsed
  return sub.status === 'trial' ? 'trial' : 'active';
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
