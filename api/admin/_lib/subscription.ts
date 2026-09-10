/**
 * Backend port of `src/lib/subscription.ts` (client Layer-B subscription state)
 * and the `coachPlanState`/`monthlyOf` helpers from
 * `src/services/platform/coachPlanApi.ts` / `adminGrowthApi.ts`. Kept local to
 * `api/admin/` per the migration's file-ownership rules.
 */
import type { CoachPlanDoc, Subscription, SubscriptionStatus } from './types';

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;

/**
 * Effective subscription state folding in the current date: a term past `endAt`
 * is `ended`... actually `expired` (trial/active term lapsed); a freeze whose
 * `frozenUntil` hasn't passed is `frozen`; otherwise `active`/`trial`. Returns
 * `none` when there is no subscription at all.
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
  if (now >= sub.endAt) return 'expired';
  return sub.status === 'trial' ? 'trial' : 'active';
}

/** Normalise a term price to an approximate monthly figure. */
export function monthlyOf(s: Subscription): number {
  const p = s.price ?? 0;
  if (!p) return 0;
  if (s.months && s.months > 0) return p / s.months;
  if (s.billingCycle === 'weekly') return p * 4.345;
  if (s.billingCycle === 'quarterly') return p / 3;
  return p;
}

export function coachPlanState(
  plan: CoachPlanDoc | null,
  now = Date.now(),
): 'trial' | 'active' | 'expired' | 'suspended' | 'none' {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  if (plan.endsAt != null && now >= plan.endsAt) return 'expired';
  if (plan.status !== 'active') return 'expired';
  return plan.plan === 'trial' ? 'trial' : 'active';
}

export const emptySubs = (): Record<SubscriptionStatus | 'none', number> => ({
  none: 0, trial: 0, active: 0, pending: 0, expired: 0, cancelled: 0, frozen: 0, ended: 0,
});

export type MemberSegment = 'all' | 'week' | 'month' | 'older';
export function inSegment(createdAt: number, seg: MemberSegment, now = Date.now()): boolean {
  if (seg === 'all') return true;
  if (seg === 'week') return createdAt >= now - 7 * DAY;
  if (seg === 'month') return createdAt >= now - 30 * DAY;
  return createdAt < now - 30 * DAY;
}
