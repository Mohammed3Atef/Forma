import { randomUUID } from 'node:crypto';
import { addDays, dayAfterEndInstant, dayOfStartInstant, daysBetween, isDateKey, nearestDayKey, startOfDay, termZone, todayIn } from '../_lib/civilDate.js';
import type { BillingCycle, SubscriptionDoc, SubscriptionPeriodDoc, SubscriptionStatus } from './_types.js';

/**
 * B3.8 — client subscription terms as fixed-day calendar periods (owner decisions 2 + 3,
 * 2026-10-21). Pure functions; the service applies them atomically.
 *
 *  - Length: whole days. One month is exactly 30 days (`DAYS_PER_MONTH`); a client trial
 *    keeps its own day count (14 by default). The Forma COACH plan (15-day trial, term days,
 *    capacity add-ons) is a different contract and is not touched here.
 *  - Dates: `[startDate, endDate)` in the term's `zone` — see `civilDate.ts`. A 30-day term from
 *    1 October covers 1–30 October; renewing it starts the next one on 31 October.
 *  - Intent (Fix C): `newTerm`, `renew` and `correct` are separate operations — nothing is
 *    inferred from overlapping dates. Only a renewal creates a second economic term.
 */

export const DAYS_PER_MONTH = 30;
export const DEFAULT_TRIAL_DAYS = 14;
/** Upper bound on one term (input sanity; ten years). */
export const MAX_TERM_DAYS = 3660;
/** EGP-only launch (owner decision 8): every priced term, payment and export is in EGP. */
export const TERM_CURRENCY = 'EGP';

const RUNNING = new Set<SubscriptionStatus>(['active', 'trial', 'frozen']);

/** A term's booked length: explicit days, else months × 30 (1 month when neither is given). */
export function lengthInDays(input: { days?: number | null; months?: number | null }): number {
  if (typeof input.days === 'number' && input.days > 0) return Math.round(input.days);
  const months = typeof input.months === 'number' && input.months > 0 ? Math.round(input.months) : 1;
  return DAYS_PER_MONTH * months;
}

/**
 * The first day of a term in `zone`: the given calendar date, else (an app older than B3.8 sent
 * an instant — the coach device's local midnight) the day that instant sits on, else today.
 */
export function startDateOf(input: { startDate?: string; startAt?: number }, zone: string, now: number): string {
  if (isDateKey(input.startDate)) return input.startDate;
  if (typeof input.startAt === 'number' && Number.isFinite(input.startAt)) return dayOfStartInstant(input.startAt, zone);
  return todayIn(zone, now);
}

/** The dated fields of a term starting `startDate` for `days` days in `zone`. */
export function datedFields(startDate: string, days: number, zone: string): Pick<SubscriptionDoc, 'startDate' | 'endDate' | 'days' | 'zone' | 'startAt' | 'endAt'> {
  const endDate = addDays(startDate, days);
  return { startDate, endDate, days, zone, startAt: startOfDay(startDate, zone), endAt: startOfDay(endDate, zone) };
}

/** A term's calendar days, read from its dates or (a term written before B3.8) its instants. */
export function calendarOf(sub: SubscriptionDoc, zoneHint?: string): { zone: string; startDate: string; endDate: string; days: number; bonus: number } {
  const zone = sub.zone && termZone(sub.zone) === sub.zone ? sub.zone : termZone(zoneHint);
  const startDate = isDateKey(sub.startDate) ? sub.startDate : dayOfStartInstant(sub.startAt, zone);
  const endDate = isDateKey(sub.endDate) ? sub.endDate : dayAfterEndInstant(sub.endAt, zone);
  const span = daysBetween(startDate, endDate);
  // Booked length vs. span: the difference is what extensions and freeze compensation added.
  // A term written before B3.8 has no booked length — its whole span counts as booked.
  const days = typeof sub.days === 'number' && sub.days > 0 ? sub.days : span;
  return { zone, startDate, endDate, days, bonus: span - days };
}

export interface TermInput {
  status: SubscriptionStatus;
  startDate?: string;
  startAt?: number;
  zone?: string;
  months?: number;
  days?: number;
  trialDays?: number;
  price?: number;
  planName?: string;
  billingCycle?: BillingCycle;
}

/**
 * A brand-new economic term (first term, a renewal's next term, an assignment, an invite claim,
 * a transfer's new term). Trial and active terms get calendar dates; any other status is stored
 * without term math, as before.
 */
export function buildTerm(input: TermInput, now: number): SubscriptionDoc {
  const zone = termZone(input.zone);
  const base: SubscriptionDoc = {
    startAt: now,
    endAt: now,
    status: input.status,
    frozenFrom: null,
    frozenUntil: null,
    updatedAt: now,
    termId: randomUUID(),
    ...(typeof input.price === 'number' ? { price: input.price, currency: TERM_CURRENCY } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
  };
  if (input.status === 'trial') {
    const days = typeof input.trialDays === 'number' && input.trialDays > 0 ? Math.round(input.trialDays) : DEFAULT_TRIAL_DAYS;
    return { ...base, ...datedFields(startDateOf(input, zone, now), days, zone) };
  }
  if (input.status === 'active') {
    const days = lengthInDays(input);
    const months = typeof input.days === 'number' && input.days > 0 ? undefined : (input.months && input.months > 0 ? Math.round(input.months) : 1);
    return { ...base, ...datedFields(startDateOf(input, zone, now), days, zone), ...(months ? { months } : {}) };
  }
  return base; // pending / expired / cancelled / frozen / ended: no term math
}

/** A term that is still running (stored running status, end not reached). */
export function isRunning(sub: SubscriptionDoc | null | undefined, now: number): boolean {
  return !!sub && RUNNING.has(sub.status) && sub.endAt > now;
}

export type RenewalStart = { ok: true; startDate: string } | { ok: false; reason: 'RENEWAL_STARTS_AFTER_TERM' };

/**
 * Where a renewal starts (Fix C): a running term is renewed from its end — the next term starts
 * the day after its last day, never overlapping it (no separate override exists). A term that
 * has lapsed, ended or been cancelled is renewed from the day the coach picks (default today);
 * a start before today over unpaid days is the confirmed, flagged back-dated renewal (B3.0.1).
 */
export function renewalStart(cur: SubscriptionDoc, requested: string | undefined, zone: string, now: number): RenewalStart {
  if (isRunning(cur, now)) {
    const startDate = calendarOf(cur, zone).endDate;
    if (requested !== undefined && requested !== startDate) return { ok: false, reason: 'RENEWAL_STARTS_AFTER_TERM' };
    return { ok: true, startDate };
  }
  return { ok: true, startDate: isDateKey(requested) ? requested : todayIn(zone, now) };
}

/**
 * The renewed term as a history entry (B3.8 fixes BE-3): with its REAL end — a renewal never
 * cuts the running term short, so the history shows no gap. `status` keeps the pre-B3.8 meaning
 * (`expired` = it had run out, `ended` = renewed while still running); `archivedBy` says why.
 */
export function archiveForRenewal(cur: SubscriptionDoc, now: number): SubscriptionPeriodDoc {
  const lapsed = cur.endAt <= now;
  const status: SubscriptionStatus = RUNNING.has(cur.status) ? (lapsed ? 'expired' : 'ended') : cur.status;
  return {
    startAt: cur.startAt,
    endAt: cur.endAt,
    ...(cur.months != null ? { months: cur.months } : {}),
    ...(cur.price != null ? { price: cur.price } : {}),
    ...(cur.currency ? { currency: cur.currency } : {}),
    ...(cur.planName ? { planName: cur.planName } : {}),
    ...(cur.termId ? { termId: cur.termId } : {}),
    ...(cur.startDate ? { startDate: cur.startDate } : {}),
    ...(cur.endDate ? { endDate: cur.endDate } : {}),
    ...(cur.days != null ? { days: cur.days } : {}),
    ...(cur.zone ? { zone: cur.zone } : {}),
    status,
    endedAt: now,
    archivedBy: 'renew',
  };
}

export interface Correction {
  startDate?: string;
  days?: number;
  months?: number;
  /** A number sets the price; `null` makes the term free. Omitted = unchanged. */
  price?: number | null;
  /** A name sets the package; `null` clears it. Omitted = unchanged. */
  planName?: string | null;
  zone?: string;
}

/**
 * Fix C — correct the CURRENT economic term in place (same `termId`): its start, length, price or
 * package. Days added by extensions and freeze compensation are kept on top of the new length.
 * A price-only or package-only correction never touches the dates. Returns `changed: false`
 * for a save that changes nothing — no write, no event, no second term.
 */
export function applyCorrection(cur: SubscriptionDoc, patch: Correction, now: number): { next: SubscriptionDoc; changed: boolean } {
  const cal = calendarOf(cur, patch.zone);
  const wantsDates = patch.startDate !== undefined || patch.days !== undefined || patch.months !== undefined;
  let next: SubscriptionDoc = { ...cur };
  let changed = false;

  if (wantsDates) {
    const startDate = isDateKey(patch.startDate) ? patch.startDate : cal.startDate;
    const days = patch.days !== undefined || patch.months !== undefined ? lengthInDays(patch) : cal.days;
    const months = patch.days !== undefined && patch.days > 0 ? undefined : patch.months !== undefined ? Math.round(patch.months) : cur.months;
    if (startDate !== cal.startDate || days !== cal.days || months !== cur.months || !cur.startDate) {
      const fields = datedFields(startDate, days, cal.zone);
      // Keep what extensions / freezes added beyond the booked length.
      const endDate = addDays(startDate, days + cal.bonus);
      next = { ...next, ...fields, endDate, endAt: startOfDay(endDate, cal.zone) };
      if (months) next.months = months;
      else delete next.months;
      changed = changed || startDate !== cal.startDate || days !== cal.days || months !== cur.months;
    }
  }
  if (patch.price !== undefined) {
    if (patch.price === null) {
      if (next.price != null) changed = true;
      delete next.price;
      delete next.currency;
    } else if (patch.price !== cur.price) {
      next.price = patch.price;
      next.currency = TERM_CURRENCY;
      changed = true;
    }
  }
  if (patch.planName !== undefined) {
    const name = patch.planName?.trim() || undefined;
    if (name !== (cur.planName || undefined)) changed = true;
    if (name) next.planName = name;
    else delete next.planName;
  }
  if (!changed) return { next: cur, changed: false };
  return { next: { ...next, termId: cur.termId ?? randomUUID(), updatedAt: now }, changed: true };
}

/** Extend (E2) on calendar days: from the term's end, or from today once it has lapsed. */
export function extendDated(cur: SubscriptionDoc, days: number, now: number): Pick<SubscriptionDoc, 'endDate' | 'endAt'> | null {
  if (!isDateKey(cur.endDate) || !cur.zone) return null;
  const base = cur.endAt > now ? cur.endDate : todayIn(cur.zone, now);
  const endDate = addDays(base, Math.round(days));
  return { endDate, endAt: startOfDay(endDate, cur.zone) };
}

/**
 * After an elapsed-time rule (freeze compensation, early unfreeze) moved `endAt` by whole days,
 * put the end back on a calendar day boundary in the term's zone (a DST change in between makes
 * `n × 24 h` land an hour off midnight).
 */
export function snapToCalendar(sub: SubscriptionDoc): SubscriptionDoc {
  if (!isDateKey(sub.endDate) || !sub.zone) return sub;
  const endDate = nearestDayKey(sub.endAt, sub.zone);
  return { ...sub, endDate, endAt: startOfDay(endDate, sub.zone) };
}
