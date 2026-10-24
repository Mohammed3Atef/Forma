import type { Subscription, SubscriptionStatus } from '@/types';
import { DEFAULT_TERM_ZONE, addDays, dayAfterEndInstant, dayOfStartInstant, daysBetween, isDateKey, isTimeZone, todayIn } from './civilDate';

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

// ---- B3.8: fixed-day calendar terms (owner decisions 2 + 3) ----------------
// Mirrors `api/coach-clients/_terms.ts`: a term is `[startDate, endDate)` in its zone, one month
// is exactly 30 days, and a running term is renewed from its end. Terms written before B3.8
// carry only instants; their days are read from those (the coach device's local midnights).

export const DAYS_PER_MONTH = 30;

/** This device's IANA zone (the zone a term the coach sets here is meant in). */
export function deviceZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(zone) ? zone : DEFAULT_TERM_ZONE;
  } catch {
    return DEFAULT_TERM_ZONE;
  }
}

/** A term's booked length in days: explicit days, else months × 30. */
export function termLengthDays(input: { days?: number | null; months?: number | null }): number {
  if (typeof input.days === 'number' && input.days > 0) return Math.round(input.days);
  return DAYS_PER_MONTH * (typeof input.months === 'number' && input.months > 0 ? Math.round(input.months) : 1);
}

/** The term's first calendar day. */
export function termFirstDay(sub: Pick<Subscription, 'startAt' | 'startDate' | 'zone'>): string {
  return isDateKey(sub.startDate) ? sub.startDate : dayOfStartInstant(sub.startAt, sub.zone ?? deviceZone());
}

/** The day after the term's last day (EXCLUSIVE end) — where a renewal starts. */
export function termEndDay(sub: Pick<Subscription, 'endAt' | 'endDate' | 'zone'>): string {
  return isDateKey(sub.endDate) ? sub.endDate : dayAfterEndInstant(sub.endAt, sub.zone ?? deviceZone());
}

/** The term's LAST covered day (inclusive) — what a person reads as "until". */
export function termLastDay(sub: Pick<Subscription, 'endAt' | 'endDate' | 'zone'>): string {
  return addDays(termEndDay(sub), -1);
}

/** A term that is still running (stored running status, end not reached). */
export function isRunningTerm(sub: Subscription | null | undefined, now = Date.now()): boolean {
  return !!sub && (sub.status === 'active' || sub.status === 'trial' || sub.status === 'frozen') && sub.endAt > now;
}

/** Where a renewal starts: the day after a running term ends; otherwise today (the coach may pick another day). */
export function renewalStartDay(sub: Subscription | null | undefined, now = Date.now()): string {
  if (sub && isRunningTerm(sub, now)) return termEndDay(sub);
  return todayIn(deviceZone(), now);
}

/** What a term starting `startDate` for `days` days covers. */
export function termPreview(startDate: string, days: number): { lastDay: string; nextStart: string } {
  const nextStart = addDays(startDate, Math.max(1, Math.round(days)));
  return { lastDay: addDays(nextStart, -1), nextStart };
}

/** Today's calendar date on this device. */
export function todayKey(now = Date.now()): string {
  return todayIn(deviceZone(), now);
}

/** Calendar days left in the term, counting today (0 once it has ended). */
export function termDaysLeft(sub: Subscription | null | undefined, now = Date.now()): number {
  if (!sub) return 0;
  return Math.max(0, daysBetween(todayKey(now), termEndDay(sub)));
}
