import type { CoachClientDoc, SubscriptionDoc, SubscriptionSnapshot } from './_types.js';

/**
 * B3.0.1 — the owner-approved client-subscription rules, as pure functions so
 * every branch is unit-tested without a database. Exact definitions (day
 * boundaries, time zones, interactions): `docs/product-audit/
 * B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md` §0 and
 * `B3.0.1_SECURITY_OWNERSHIP_PLAN.md` §6.2.
 *
 * Time model: every stored date is an instant (ms). Dates the coach picks are
 * the coach device's local midnight; the server never guesses a time zone.
 */

export const DAY_MS = 86_400_000;

/** Stable machine reasons (surfaced as `error.data.reason`). */
export type SubscriptionRuleReason = 'RENEWAL_REQUIRED' | 'FREEZE_NOT_ALLOWED' | 'FREEZE_INVALID_WINDOW' | 'FREEZE_OUT_OF_TERM' | 'NOT_FROZEN';

export const SUBSCRIPTION_RULE_MESSAGES: Record<SubscriptionRuleReason, string> = {
  RENEWAL_REQUIRED: 'This term has ended — renew it instead of extending it',
  FREEZE_NOT_ALLOWED: 'Only a running, paid term that is not already frozen can be frozen',
  FREEZE_INVALID_WINDOW: 'A freeze needs an end date after its start, and cannot start in the past',
  FREEZE_OUT_OF_TERM: 'The freeze must fit inside the current term',
  NOT_FROZEN: 'This subscription is not frozen',
};

export type RuleResult = { ok: true; next: SubscriptionDoc } | { ok: false; reason: SubscriptionRuleReason };

export function snapshotOf(sub: SubscriptionDoc): SubscriptionSnapshot {
  return {
    status: sub.status,
    startAt: sub.startAt,
    endAt: sub.endAt,
    frozenFrom: sub.frozenFrom ?? null,
    frozenUntil: sub.frozenUntil ?? null,
    freezeCredit: sub.freezeCredit ?? null,
  };
}

/**
 * A renewal (`setTerm`) that starts before today over time the previous term
 * did not cover as paid: it lapsed / ended, or the start moved earlier. Logs
 * refused for those days become syncable, so the coach confirms it explicitly
 * and the audit event is flagged (owner, B3.0.1). Mirrored by the panel.
 */
export function isBackdatedRenewal(prev: SubscriptionDoc | null | undefined, startAt: number, now: number): boolean {
  if (!(startAt < now - DAY_MS)) return false;
  if (!prev) return true;
  const terminal = prev.status === 'expired' || prev.status === 'ended' || prev.status === 'cancelled' || prev.status === 'pending';
  return terminal || prev.endAt <= now || startAt < prev.startAt - DAY_MS;
}

/** A freeze written since B3.0.1: scheduled, compensated, effective only inside its window. */
export function isScheduledFreeze(sub: SubscriptionDoc | null | undefined): boolean {
  return !!sub && sub.status === 'frozen' && sub.freezeCredit != null;
}

/**
 * Extend (E2): `endAt = max(now, endAt) + days`. Allowed for stored active /
 * trial / frozen terms (a freeze keeps its window and credit). Stored expired,
 * ended, cancelled, pending and "no term" need a renewal instead.
 */
export function applyExtend(cur: SubscriptionDoc | null | undefined, days: number, now: number): RuleResult {
  if (!cur || !(cur.status === 'active' || cur.status === 'trial' || cur.status === 'frozen')) return { ok: false, reason: 'RENEWAL_REQUIRED' };
  return { ok: true, next: { ...cur, endAt: Math.max(now, cur.endAt) + days * DAY_MS, updatedAt: now } };
}

/**
 * Freeze (F-C), validity F1–F5 then effect: status `frozen`, the window as
 * given, `freezeCredit = until - max(from, startAt)`, `endAt += freezeCredit`.
 */
export function applyFreeze(cur: SubscriptionDoc | null | undefined, from: number, until: number, note: string | undefined, now: number): RuleResult {
  if (!cur) return { ok: false, reason: 'FREEZE_NOT_ALLOWED' };
  // F1: an active term, or a frozen one whose freeze is already over.
  const previousFreezeOver = cur.status === 'frozen' && cur.frozenUntil != null && cur.frozenUntil <= now;
  if (!(cur.status === 'active' || previousFreezeOver)) return { ok: false, reason: 'FREEZE_NOT_ALLOWED' };
  // F2: the term is still running.
  if (!(cur.endAt > now)) return { ok: false, reason: 'FREEZE_NOT_ALLOWED' };
  // F3: a finite window with an end after its start.
  if (!Number.isFinite(from) || !Number.isFinite(until) || !(until > from)) return { ok: false, reason: 'FREEZE_INVALID_WINDOW' };
  // F4: not back-dated (today's local midnight is < 1 day ago in every zone).
  if (from < now - DAY_MS) return { ok: false, reason: 'FREEZE_INVALID_WINDOW' };
  // F5: inside the paid term (the end before this freeze's compensation). A
  // freeze may begin on the term's first calendar day (the picker sends local
  // midnight, a term usually starts later that day) …
  if (from < cur.startAt - DAY_MS || until > cur.endAt) return { ok: false, reason: 'FREEZE_OUT_OF_TERM' };
  // … but only frozen time INSIDE the paid term is compensated (no free service).
  const credit = until - Math.max(from, cur.startAt);
  return {
    ok: true,
    next: {
      ...cur,
      status: 'frozen',
      frozenFrom: from,
      frozenUntil: until,
      freezeCredit: credit,
      endAt: cur.endAt + credit,
      ...(note ? { note } : {}),
      updatedAt: now,
    },
  };
}

/**
 * Unfreeze. A B3.0.1 freeze gives back what was not used: everything when it
 * never started, the unused whole days when ended early (each started frozen
 * day counts, never more than was credited), nothing when it already
 * finished. A freeze stored before B3.0.1 is cleared without moving `endAt`.
 */
export function applyUnfreeze(cur: SubscriptionDoc | null | undefined, now: number): RuleResult {
  if (!cur || cur.status !== 'frozen') return { ok: false, reason: 'NOT_FROZEN' };
  let endAt = cur.endAt;
  if (cur.freezeCredit != null && cur.frozenFrom != null && cur.frozenUntil != null) {
    if (now < cur.frozenUntil) {
      // Keep compensation only for the days actually frozen INSIDE the paid
      // term — each started day counts whole — never more than was credited.
      const used = Math.max(0, now - Math.max(cur.frozenFrom, cur.startAt));
      const kept = Math.min(cur.freezeCredit, Math.ceil(used / DAY_MS) * DAY_MS);
      endAt = cur.endAt - (cur.freezeCredit - kept);
    }
  }
  return { ok: true, next: { ...cur, status: 'active', frozenFrom: null, frozenUntil: null, freezeCredit: null, endAt, updatedAt: now } };
}

// ---------------------------------------------------------------------------
// B3-S06 (owner R-6): may a client log for a given calendar day?
// ---------------------------------------------------------------------------

/** A time span during which the client had a coach and the coach's subscription was read-only. */
export interface Window {
  start: number;
  end: number;
  /** Which rule produced it (U1–U5 in the plan) — for tests and logs. */
  rule: 'U1' | 'U2' | 'U3' | 'U4' | 'U5';
}

type RelLike = Pick<CoachClientDoc, 'status' | 'createdAt' | 'endedAt' | 'subscription' | 'subscriptionHistory' | 'subscriptionEvents'>;

/** Statuses whose term math means something (pending = `limited` in the app, never enforced). */
const TERM_STATUSES = new Set(['active', 'trial', 'frozen', 'expired', 'cancelled', 'ended']);

/**
 * Every unauthorized window the stored data PROVES for one relationship,
 * clipped to the relationship's lifetime `[createdAt, endedAt)`. Anything the
 * data cannot prove (terms overwritten before B0, freezes stored before
 * B3.0.1, cancellations kept only in the archive) yields no window — those
 * dates are accepted, never guessed.
 */
export function unauthorizedWindows(rel: RelLike): Window[] {
  const lifeStart = rel.createdAt;
  const lifeEnd = rel.status === 'ended' ? (rel.endedAt ?? rel.createdAt) : Number.POSITIVE_INFINITY;
  const out: Window[] = [];
  const add = (start: number, end: number, rule: Window['rule']) => {
    const s = Math.max(start, lifeStart);
    const e = Math.min(end, lifeEnd);
    if (Number.isFinite(s) && e > s) out.push({ start: s, end: e, rule });
  };

  const sub = rel.subscription;
  if (sub && TERM_STATUSES.has(sub.status) && Number.isFinite(sub.endAt)) {
    // U1: after the latest term ended (or was cancelled) — nothing later exists.
    const termEnd = sub.status === 'cancelled' && sub.cancelledAt != null ? Math.min(sub.endAt, sub.cancelledAt) : sub.endAt;
    add(termEnd, Number.POSITIVE_INFINITY, 'U1');
    // U2: inside the current scheduled freeze.
    if (isScheduledFreeze(sub) && sub.frozenFrom != null && sub.frozenUntil != null) add(sub.frozenFrom, sub.frozenUntil, 'U2');
  }

  // U4: renewal gaps — a term that LAPSED before it was renewed is read-only
  // from its end until the renewal, or until the earliest start of any LATER
  // term (a coach who back-dates a renewal over the gap pays for those days).
  const history = rel.subscriptionHistory ?? [];
  history.forEach((h, k) => {
    if (h.status !== 'expired') return;
    const laterStarts = [...history.slice(k + 1).map((x) => x.startAt), ...(sub ? [sub.startAt] : [])].filter((x) => Number.isFinite(x));
    add(h.endAt, Math.min(h.endedAt, ...laterStarts), 'U4');
  });

  // U3 + U5 from the B3.0.1 audit events.
  const events = rel.subscriptionEvents ?? [];
  events.forEach((e, k) => {
    if (e.op === 'extend' && e.before && e.before.endAt < e.at) {
      // The lapse before an extension — narrowed by any later renewal back-dated over it.
      const laterStarts = events.slice(k + 1).filter((x) => x.op === 'setTerm').map((x) => x.after.startAt);
      add(e.before.endAt, Math.min(e.at, ...laterStarts), 'U5');
    }
    if (e.op === 'freeze' && e.after.freezeCredit != null && e.after.frozenFrom != null && e.after.frozenUntil != null) {
      // The freeze ran until its end, or until the next change that ended it.
      const stop = events.slice(k + 1).find((x) => x.op === 'unfreeze' || x.op === 'setTerm' || x.op === 'freeze');
      const end = stop ? Math.min(e.after.frozenUntil, stop.at) : e.after.frozenUntil;
      add(e.after.frozenFrom, end, 'U3');
    }
  });
  return out;
}

/** Earliest / latest instants of a calendar day in any time zone (UTC+14 … UTC−12). */
export function dayBounds(day: string): { start: number; end: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== day) return null;
  return { start: t - 14 * 3_600_000, end: t + DAY_MS + 12 * 3_600_000 };
}

/**
 * The window that makes `day` unauthorized, or null when the day may be
 * logged. A day is refused only when ALL of it, in every time zone, lies inside
 * one proven window — a day touching an authorized instant anywhere is kept.
 */
export function unauthorizedDay(rels: RelLike[], day: string): Window | null {
  const b = dayBounds(day);
  if (!b) return null;
  for (const rel of rels) {
    for (const w of unauthorizedWindows(rel)) {
      if (b.start >= w.start && b.end <= w.end) return w;
    }
  }
  return null;
}
