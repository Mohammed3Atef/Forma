import type { CoachClientRelationship, Subscription, SubscriptionPeriod, SubscriptionStatus } from '../types';
import { effectiveSubscriptionStatus, termFirstDay, termLastDay } from './subscription';
import { clientStateOf, type ClientState } from './coachDirectory';
import { COMING_UP_MS, DAY_MS, LAPSED_WINDOW_MS, RENEWAL_WINDOW_MS } from './coachToday';
import { dayKeyOf, toDate } from './format';

/**
 * Me › Business (B3.8, blueprint §6.7; owner decisions D1 / D2 / D3) — every figure, list and export
 * row the Business screen shows is computed here and pinned by `coachBusiness.test.ts`.
 *
 * Forma records no payments. A subscription term is what the coach agreed with a client (dates,
 * price, currency) — not money received — so the month's figures are package prices of terms, named
 * for what they are (D2):
 *
 *  - **Booked** — terms that STARTED in the month: the current term and every archived term of every
 *    relationship this coach has had, ended ones included (the term was booked with this coach).
 *  - **Due** — running (trial / active) terms of CURRENT clients that end after now and by the
 *    month's last day: what renewing at the same price would bring. Projected, never invoiced.
 *  - **Lost** — terms that ran out or were cancelled in the month and were not renewed (it is still
 *    the relationship's current term): current clients, and former clients whose term ended while
 *    they were still this coach's client. Releasing or transferring a client is not a lost term.
 *
 * D1: due, renewals, lapsed and the package-status counts read **active** relationships only (a
 * released or transferred client used to keep showing as due, with no name). Amounts are grouped by
 * the term's own currency and never added across currencies; a term without a currency is its own
 * group. Free terms (no price, or 0) add nothing. The month is the calendar month in this device's
 * time zone — the screen shows its dates.
 */

export interface MonthRange {
  start: number;
  /** Last millisecond of the month. */
  end: number;
  /** `YYYY-MM` — B3.8: a term's own start date (its calendar day) is matched against this. */
  key: string;
}

/** The calendar month containing `now`, in this device's time zone. */
export function monthRange(now: number): MonthRange {
  const d = new Date(now);
  return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() - 1, key: dayKeyOf(now).slice(0, 7) };
}

/**
 * The month a term was booked in — B3.8: its own first calendar day (`startDate`, the coach's
 * calendar), so the month never shifts with the reader's zone or a DST change; a term written
 * before B3.8 falls back to its start instant on this device.
 */
export function termMonthKey(term: Pick<Subscription, 'startAt' | 'startDate'>): string {
  return term.startDate ? term.startDate.slice(0, 7) : dayKeyOf(term.startAt).slice(0, 7);
}

/** EGP-only (B3.8): a priced term without a currency was written in EGP; other codes (pre-B3.8 test data) keep theirs. */
export const currencyKey = (currency: string | undefined) => (currency ?? '').trim().toUpperCase() || 'EGP';

export interface MoneyLine {
  /** ISO code as stored on the terms; '' when a term has none. */
  currency: string;
  booked: number;
  due: number;
  lost: number;
  bookedTerms: number;
  dueTerms: number;
  lostTerms: number;
}

export interface RenewalRow {
  clientId: string;
  endAt: number;
  /** B3.8: the term's LAST covered calendar day (the end is exclusive). */
  lastDay: string;
  daysLeft: number;
  /** Ends within 7 days — Today's "renewal due" window. */
  soon: boolean;
  trial: boolean;
  price?: number;
  currency?: string;
  planName?: string;
}

export interface LapsedRow {
  clientId: string;
  endAt: number;
  /** B3.8: the term's LAST covered calendar day. */
  lastDay: string;
  daysAgo: number;
  price?: number;
  currency?: string;
  planName?: string;
}

export interface BusinessSummary {
  month: MonthRange;
  money: MoneyLine[];
  /** Current clients (active relationships) by package state — the Clients filter states. */
  counts: Record<ClientState, number>;
  /** Running terms of current clients that end within 30 days, soonest first. */
  renewals: RenewalRow[];
  /** Terms of current clients that ran out by themselves in the last 30 days (Today's rule), latest first. */
  lapsed: LapsedRow[];
}

const RUNNING = new Set<SubscriptionStatus | 'none'>(['active', 'trial']);
const priced = (price: number | undefined): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0;
const round = (n: number) => Math.round(n * 100) / 100;
const isActive = (rel: CoachClientRelationship) => rel.status === 'active';

/** Every term a relationship holds: the current one, its archived terms, and those of earlier stints with this coach. */
export function termsOf(rel: CoachClientRelationship): { term: Subscription | SubscriptionPeriod; current: boolean }[] {
  const out: { term: Subscription | SubscriptionPeriod; current: boolean }[] = [];
  if (rel.subscription) out.push({ term: rel.subscription, current: true });
  for (const h of rel.subscriptionHistory ?? []) out.push({ term: h, current: false });
  for (const stint of rel.previousStints ?? []) {
    if (stint.subscription) out.push({ term: stint.subscription, current: false });
    for (const h of stint.subscriptionHistory ?? []) out.push({ term: h, current: false });
  }
  return out;
}

/** When a current term was lost (ran out / was cancelled), or null when it is not lost. */
function lostAt(sub: Subscription, now: number): number | null {
  const eff = effectiveSubscriptionStatus(sub, now);
  if (eff === 'cancelled') return sub.cancelledAt ?? sub.updatedAt;
  if (eff === 'expired') return sub.endAt;
  return null;
}

export function businessSummary(rels: CoachClientRelationship[], now: number): BusinessSummary {
  const month = monthRange(now);
  const inMonth = (ms: number | null | undefined) => ms != null && ms >= month.start && ms <= month.end;
  const lines = new Map<string, MoneyLine>();
  const line = (currency: string | undefined) => {
    const key = currencyKey(currency);
    let l = lines.get(key);
    if (!l) lines.set(key, (l = { currency: key, booked: 0, due: 0, lost: 0, bookedTerms: 0, dueTerms: 0, lostTerms: 0 }));
    return l;
  };
  const counts: Record<ClientState, number> = { active: 0, trial: 0, expiring: 0, paused: 0, expired: 0, pending: 0, none: 0 };
  const renewals: RenewalRow[] = [];
  const lapsed: LapsedRow[] = [];

  for (const rel of rels) {
    // Booked — any relationship, any of its terms, started this month (a pending term has not started).
    for (const { term } of termsOf(rel)) {
      if (term.status === 'pending' || !priced(term.price) || termMonthKey(term) !== month.key) continue;
      const l = line(term.currency);
      l.booked += term.price;
      l.bookedTerms += 1;
    }

    const sub = rel.subscription;
    // Lost — the current term only (an archived one was followed by a renewal).
    if (sub && priced(sub.price)) {
      const at = lostAt(sub, now);
      const stillClient = isActive(rel) || (rel.endedAt != null && at != null && at <= rel.endedAt);
      if (at != null && inMonth(at) && stillClient) {
        const l = line(sub.currency);
        l.lost += sub.price;
        l.lostTerms += 1;
      }
    }

    if (!isActive(rel)) continue; // D1: everything below is about current clients only
    counts[clientStateOf(rel, now).state] += 1;
    if (!sub) continue;
    const eff = effectiveSubscriptionStatus(sub, now);
    const left = sub.endAt - now;
    if (RUNNING.has(eff) && left > 0) {
      if (priced(sub.price) && sub.endAt <= month.end) {
        const l = line(sub.currency);
        l.due += sub.price;
        l.dueTerms += 1;
      }
      if (left <= COMING_UP_MS) {
        renewals.push({ clientId: rel.clientId, endAt: sub.endAt, lastDay: termLastDay(sub), daysLeft: Math.ceil(left / DAY_MS), soon: left <= RENEWAL_WINDOW_MS, trial: eff === 'trial', price: sub.price, currency: sub.currency, planName: sub.planName });
      }
    } else if (eff === 'expired' && sub.status !== 'cancelled' && sub.status !== 'ended' && now - sub.endAt <= LAPSED_WINDOW_MS) {
      // Today's "lapsed" rule: a term that ran out by itself (a cancelled / ended term was the coach's decision).
      lapsed.push({ clientId: rel.clientId, endAt: sub.endAt, lastDay: termLastDay(sub), daysAgo: Math.max(0, Math.floor((now - sub.endAt) / DAY_MS)), price: sub.price, currency: sub.currency, planName: sub.planName });
    }
  }

  const money = [...lines.values()]
    .filter((l) => l.bookedTerms + l.dueTerms + l.lostTerms > 0)
    .map((l) => ({ ...l, booked: round(l.booked), due: round(l.due), lost: round(l.lost) }))
    .sort((a, b) => (a.currency === 'EGP' ? -1 : b.currency === 'EGP' ? 1 : a.currency.localeCompare(b.currency)));
  renewals.sort((a, b) => a.endAt - b.endAt);
  lapsed.sort((a, b) => b.endAt - a.endAt);
  return { month, money, counts, renewals, lapsed };
}

// ---- exports (D3) --------------------------------------------------------------------------

/** An inclusive date range from two optional `YYYY-MM-DD` inputs (this device's time zone); empty = open-ended. */
export function dayRange(from: string, to: string): { from: number | null; to: number | null } {
  const at = (v: string, endOfDay: boolean) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (endOfDay ? 1 : 0));
    return endOfDay ? d.getTime() - 1 : d.getTime();
  };
  return { from: at(from, false), to: at(to, true) };
}
const within = (ms: number, r: { from: number | null; to: number | null }) => (r.from == null || ms >= r.from) && (r.to == null || ms <= r.to);

export interface TermExportRow {
  clientId: string;
  /** Still this coach's client (active relationship). */
  currentClient: boolean;
  /** The relationship's current term (vs. an archived one). */
  currentTerm: boolean;
  /** B3.8: the economic term's id (absent on terms written before B3.8) — matches payments. */
  termId?: string;
  startAt: number;
  endAt: number;
  /** B3.8: first and LAST covered calendar day (inclusive). */
  firstDay: string;
  lastDay: string;
  /** The current term's effective status; an archived term's stored final status. */
  status: SubscriptionStatus;
  /** B3.8: an archived term that was renewed (not cut short). */
  renewed: boolean;
  planName?: string;
  months?: number;
  days?: number;
  price?: number;
  currency?: string;
  relationshipEndedAt?: number;
}

/** Every term of every relationship (current and archived, current and former clients) that started inside the range, newest first. */
export function termExportRows(rels: CoachClientRelationship[], range: { from: number | null; to: number | null }, now: number): TermExportRow[] {
  const out: TermExportRow[] = [];
  for (const rel of rels) {
    for (const { term, current } of termsOf(rel)) {
      if (term.status === 'pending') continue;
      const firstDay = termFirstDay(term);
      if (!within(toDate(firstDay).getTime(), range)) continue;
      const sub = current ? (term as Subscription) : null;
      out.push({
        clientId: rel.clientId,
        currentClient: isActive(rel),
        currentTerm: current,
        ...(term.termId ? { termId: term.termId } : {}),
        startAt: term.startAt,
        endAt: term.endAt,
        firstDay,
        lastDay: termLastDay(term),
        status: sub ? (effectiveSubscriptionStatus(sub, now) as SubscriptionStatus) : term.status,
        renewed: !sub && (term as SubscriptionPeriod).archivedBy === 'renew',
        planName: term.planName,
        months: term.months,
        days: term.days,
        price: term.price,
        currency: term.price != null ? currencyKey(term.currency) : term.currency,
        relationshipEndedAt: isActive(rel) ? undefined : rel.endedAt,
      });
    }
  }
  return out.sort((a, b) => b.firstDay.localeCompare(a.firstDay) || b.startAt - a.startAt || a.clientId.localeCompare(b.clientId));
}

/** Current clients added inside the range (by the active relationship's start), oldest first. */
export function clientExportRels(rels: CoachClientRelationship[], range: { from: number | null; to: number | null }): CoachClientRelationship[] {
  return rels.filter((r) => isActive(r) && within(r.createdAt, range)).sort((a, b) => a.createdAt - b.createdAt);
}
