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
  if (sub.status === 'ended' || now >= sub.endAt) return 'ended';
  if (sub.status === 'frozen' && (sub.frozenUntil == null || now < sub.frozenUntil)) return 'frozen';
  return 'active';
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
