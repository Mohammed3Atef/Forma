import { describe, expect, it } from 'vitest';
import { DAY_MS, applyExtend, applyFreeze, applyUnfreeze, dayBounds, unauthorizedDay, unauthorizedWindows } from './_subscriptionRules.js';
import { effectiveSubscriptionStatus } from '../admin/_lib/subscription.js';
import type { CoachClientDoc, SubscriptionDoc } from './_types.js';

/**
 * B3.0.1 — the owner-approved subscription rules (B3-S07: Extend E2, Freeze
 * F-C) and the date-based read-only rule (B3-S06 / R-6), as pure functions.
 * Spec: B3_SUBSCRIPTION_EXTEND_FREEZE_DECISION.md §0, B3.0.1 plan §6.2.
 */
const H = 3_600_000;
const at = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h);
const term = (over: Partial<SubscriptionDoc> = {}): SubscriptionDoc => ({
  status: 'active',
  startAt: at(2026, 10, 1),
  endAt: at(2026, 10, 31),
  frozenFrom: null,
  frozenUntil: null,
  updatedAt: 1,
  ...over,
});
const ok = (r: ReturnType<typeof applyExtend>) => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.next;
};

describe('Extend (E2): max(now, end) + days', () => {
  it('a running term extends from its end; a lapsed one from now', () => {
    expect(ok(applyExtend(term(), 7, at(2026, 10, 20))).endAt).toBe(at(2026, 11, 7));
    expect(ok(applyExtend(term(), 7, at(2026, 11, 10, 9))).endAt).toBe(at(2026, 11, 17, 9));
    expect(ok(applyExtend(term({ status: 'trial' }), 3, at(2026, 10, 2))).endAt).toBe(at(2026, 11, 3));
  });

  it('a frozen term extends without touching its freeze window or credit', () => {
    const frozen = term({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS, endAt: at(2026, 11, 7) });
    const next = ok(applyExtend(frozen, 5, at(2026, 10, 12)));
    expect(next).toMatchObject({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS, endAt: at(2026, 11, 12) });
  });

  it('stored expired / ended / cancelled / pending and "no term" need a renewal', () => {
    for (const status of ['expired', 'ended', 'cancelled', 'pending'] as const) {
      expect(applyExtend(term({ status }), 7, at(2026, 10, 5))).toEqual({ ok: false, reason: 'RENEWAL_REQUIRED' });
    }
    expect(applyExtend(undefined, 7, at(2026, 10, 5))).toEqual({ ok: false, reason: 'RENEWAL_REQUIRED' });
  });
});

describe('Freeze (F-C): validity F1–F5 and effect', () => {
  const now = at(2026, 10, 5, 12);

  it('accepted: stores the window, the credit, and pushes the end by the frozen days', () => {
    const next = ok(applyFreeze(term(), at(2026, 10, 10), at(2026, 10, 17), 'travel', now));
    expect(next).toMatchObject({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS, endAt: at(2026, 11, 7), note: 'travel', updatedAt: now });
  });

  it('F1: only an active term (or a frozen one whose freeze is over)', () => {
    for (const status of ['trial', 'pending', 'expired', 'ended', 'cancelled'] as const) {
      expect(applyFreeze(term({ status }), at(2026, 10, 10), at(2026, 10, 17), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_NOT_ALLOWED' });
    }
    const running = term({ status: 'frozen', frozenFrom: at(2026, 10, 4), frozenUntil: at(2026, 10, 8), freezeCredit: 4 * DAY_MS });
    expect(applyFreeze(running, at(2026, 10, 10), at(2026, 10, 12), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_NOT_ALLOWED' });
    const scheduled = term({ status: 'frozen', frozenFrom: at(2026, 10, 20), frozenUntil: at(2026, 10, 22), freezeCredit: 2 * DAY_MS });
    expect(applyFreeze(scheduled, at(2026, 10, 10), at(2026, 10, 12), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_NOT_ALLOWED' });
    const finished = term({ status: 'frozen', frozenFrom: at(2026, 10, 2), frozenUntil: at(2026, 10, 4), freezeCredit: 2 * DAY_MS, endAt: at(2026, 11, 2) });
    expect(applyFreeze(finished, at(2026, 10, 10), at(2026, 10, 12), undefined, now).ok).toBe(true);
    expect(applyFreeze(undefined, at(2026, 10, 10), at(2026, 10, 12), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_NOT_ALLOWED' });
  });

  it('F2: a lapsed term cannot be frozen', () => {
    expect(applyFreeze(term({ endAt: at(2026, 10, 4) }), at(2026, 10, 5), at(2026, 10, 6), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_NOT_ALLOWED' });
  });

  it('F3: a finite end after the start is required', () => {
    expect(applyFreeze(term(), at(2026, 10, 10), at(2026, 10, 10), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_INVALID_WINDOW' });
    expect(applyFreeze(term(), at(2026, 10, 10), at(2026, 10, 9), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_INVALID_WINDOW' });
    expect(applyFreeze(term(), at(2026, 10, 10), Number.NaN, undefined, now)).toEqual({ ok: false, reason: 'FREEZE_INVALID_WINDOW' });
    expect(applyFreeze(term(), at(2026, 10, 10), Number.POSITIVE_INFINITY, undefined, now)).toEqual({ ok: false, reason: 'FREEZE_INVALID_WINDOW' });
  });

  it('F4: today is allowed (local midnight < 1 day ago in every zone); yesterday is not', () => {
    expect(applyFreeze(term(), now - 23 * H, at(2026, 10, 9), undefined, now).ok).toBe(true);
    expect(applyFreeze(term(), now - DAY_MS - 1, at(2026, 10, 9), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_INVALID_WINDOW' });
  });

  it('F5: the window must fit inside the paid term (end before compensation)', () => {
    const future = term({ startAt: at(2026, 10, 8) });
    expect(applyFreeze(future, at(2026, 10, 6), at(2026, 10, 9), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_OUT_OF_TERM' });
    // A term that started at 14:00 today may be frozen "from today" (local midnight) — only the paid part is credited.
    const startedToday = term({ startAt: at(2026, 10, 5, 14), endAt: at(2026, 11, 5, 14) });
    const sameDay = ok(applyFreeze(startedToday, at(2026, 10, 5), at(2026, 10, 8), undefined, at(2026, 10, 5, 15)));
    expect(sameDay.freezeCredit).toBe(at(2026, 10, 8) - at(2026, 10, 5, 14));
    expect(sameDay.endAt).toBe(at(2026, 11, 5, 14) + (at(2026, 10, 8) - at(2026, 10, 5, 14)));
    expect(applyFreeze(term(), at(2026, 10, 25), at(2026, 11, 2), undefined, now)).toEqual({ ok: false, reason: 'FREEZE_OUT_OF_TERM' });
    expect(applyFreeze(term(), at(2026, 10, 25), at(2026, 10, 31), undefined, now).ok).toBe(true);
  });
});

describe('Unfreeze / early unfreeze — the worked example (term 1–31 Oct, freeze 10 → 17 Oct accepted 5 Oct)', () => {
  const frozen = ok(applyFreeze(term(), at(2026, 10, 10), at(2026, 10, 17), undefined, at(2026, 10, 5)));

  it('accepted → end 7 Nov', () => expect(frozen.endAt).toBe(at(2026, 11, 7)));
  it('cancelled before it starts → all compensation removed (end 31 Oct)', () => {
    expect(ok(applyUnfreeze(frozen, at(2026, 10, 5, 18)))).toMatchObject({ status: 'active', endAt: at(2026, 10, 31), frozenFrom: null, frozenUntil: null, freezeCredit: null });
  });
  it('ended early on 12 Oct 15:00 → only the 4 whole unused days are removed (end 3 Nov)', () => {
    expect(ok(applyUnfreeze(frozen, at(2026, 10, 12, 15))).endAt).toBe(at(2026, 11, 3));
  });
  it('finished (18 Oct) → nothing removed (end 7 Nov)', () => {
    expect(ok(applyUnfreeze(frozen, at(2026, 10, 18))).endAt).toBe(at(2026, 11, 7));
  });
  it('extend during the freeze, then an early unfreeze: the extension survives, only unused frozen days go', () => {
    const extended = ok(applyExtend(frozen, 10, at(2026, 10, 11)));
    expect(extended.endAt).toBe(at(2026, 11, 17));
    expect(ok(applyUnfreeze(extended, at(2026, 10, 12, 15))).endAt).toBe(at(2026, 11, 13));
  });
  it('an early unfreeze never removes more than was credited', () => {
    const startedToday = term({ startAt: at(2026, 10, 5, 14), endAt: at(2026, 11, 5, 14) });
    const f = ok(applyFreeze(startedToday, at(2026, 10, 5), at(2026, 10, 8), undefined, at(2026, 10, 5, 13)));
    expect(ok(applyUnfreeze(f, at(2026, 10, 5, 1))).endAt).toBe(at(2026, 11, 5, 14));
  });
  it('a freeze stored before B3.0.1 (no credit) is cleared without moving the end; a non-frozen term cannot be unfrozen', () => {
    const legacy = term({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17) });
    expect(ok(applyUnfreeze(legacy, at(2026, 10, 12))).endAt).toBe(at(2026, 10, 31));
    expect(applyUnfreeze(term(), at(2026, 10, 12))).toEqual({ ok: false, reason: 'NOT_FROZEN' });
    expect(applyUnfreeze(term({ status: 'cancelled' }), at(2026, 10, 12))).toEqual({ ok: false, reason: 'NOT_FROZEN' });
  });
});

describe('effective status — scheduled freezes vs freezes stored before B3.0.1', () => {
  const scheduled = term({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS, endAt: at(2026, 11, 7) });
  it('a scheduled freeze is frozen only inside its window', () => {
    expect(effectiveSubscriptionStatus(scheduled, at(2026, 10, 9, 23))).toBe('active');
    expect(effectiveSubscriptionStatus(scheduled, at(2026, 10, 10))).toBe('frozen');
    expect(effectiveSubscriptionStatus(scheduled, at(2026, 10, 16, 23))).toBe('frozen');
    expect(effectiveSubscriptionStatus(scheduled, at(2026, 10, 17))).toBe('active');
    expect(effectiveSubscriptionStatus(scheduled, at(2026, 11, 7))).toBe('expired');
  });
  it('a legacy freeze keeps its original meaning (frozen now, until frozenUntil or indefinitely) — no silent migration', () => {
    const legacy = term({ status: 'frozen', frozenFrom: at(2026, 10, 20), frozenUntil: at(2026, 10, 27) });
    expect(effectiveSubscriptionStatus(legacy, at(2026, 10, 5))).toBe('frozen');
    expect(effectiveSubscriptionStatus(legacy, at(2026, 10, 28))).toBe('active');
    expect(effectiveSubscriptionStatus(term({ status: 'frozen', frozenUntil: null }), at(2026, 12, 25))).toBe('frozen');
  });
});

// ---------------------------------------------------------------------------
// B3-S06: date-based read-only for workout / nutrition / cardio logs
// ---------------------------------------------------------------------------

const rel = (over: Partial<CoachClientDoc> = {}): CoachClientDoc => ({
  _id: 'coach-1__client-1',
  coachId: 'coach-1',
  clientId: 'client-1',
  status: 'active',
  createdBy: 'coach-1',
  createdAt: at(2026, 9, 1),
  updatedAt: 1,
  subscription: term(),
  ...over,
});

describe('day bounds: a calendar day spans UTC+14 … UTC−12', () => {
  it('earliest start and latest end', () => {
    expect(dayBounds('2026-10-05')).toEqual({ start: at(2026, 10, 5) - 14 * H, end: at(2026, 10, 6) + 12 * H });
    expect(dayBounds('2026-02-30')).toBeNull();
    expect(dayBounds('5 Oct')).toBeNull();
  });
});

describe('unauthorized windows (only what the stored data proves)', () => {
  it('U1 — after the term ended: refused, with up to a day of time-zone grace; in-term days always accepted', () => {
    const rels = [rel()];
    expect(unauthorizedDay(rels, '2026-10-30')).toBeNull();
    expect(unauthorizedDay(rels, '2026-10-31')).toBeNull(); // the end day itself touches authorized time west of UTC
    expect(unauthorizedDay(rels, '2026-11-01')?.rule).toBe('U1');
    expect(unauthorizedDay(rels, '2027-01-01')?.rule).toBe('U1');
  });

  it('pre-term days are accepted (a renewal with a later start gave full access; earlier terms unknown)', () => {
    const rels = [rel({ subscription: term({ startAt: at(2026, 10, 10) }) })];
    expect(unauthorizedDay(rels, '2026-10-05')).toBeNull();
    expect(unauthorizedDay(rels, '2026-09-15')).toBeNull();
  });

  it('pending / no subscription and "no coach at all" are never enforced', () => {
    expect(unauthorizedDay([rel({ subscription: term({ status: 'pending', startAt: at(2026, 10, 1), endAt: at(2026, 10, 1) }) })], '2026-12-01')).toBeNull();
    expect(unauthorizedDay([rel({ subscription: undefined })], '2026-12-01')).toBeNull();
    expect(unauthorizedDay([], '2026-12-01')).toBeNull();
  });

  it('a cancelled term is read-only from its cancellation', () => {
    const rels = [rel({ subscription: term({ status: 'cancelled', cancelledAt: at(2026, 10, 15) }) })];
    expect(unauthorizedDay(rels, '2026-10-14')).toBeNull();
    expect(unauthorizedDay(rels, '2026-10-17')?.rule).toBe('U1');
  });

  it('U2 — inside a scheduled freeze (whole days only; the edge days get the time-zone grace)', () => {
    const rels = [rel({ subscription: term({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS, endAt: at(2026, 11, 7) }) })];
    expect(unauthorizedDay(rels, '2026-10-09')).toBeNull();
    expect(unauthorizedDay(rels, '2026-10-10')).toBeNull();
    expect(unauthorizedDay(rels, '2026-10-11')?.rule).toBe('U2');
    expect(unauthorizedDay(rels, '2026-10-15')?.rule).toBe('U2');
    expect(unauthorizedDay(rels, '2026-10-16')).toBeNull();
    expect(unauthorizedDay(rels, '2026-10-20')).toBeNull();
    expect(unauthorizedDay(rels, '2026-11-05')).toBeNull(); // the compensated days are paid days
  });

  it('a freeze stored before B3.0.1 is not enforced (its real start is unknown)', () => {
    const rels = [rel({ subscription: term({ status: 'frozen', frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17) }) })];
    expect(unauthorizedDay(rels, '2026-10-12')).toBeNull();
  });

  it('U3 — a past freeze from the audit events, ended early by an unfreeze', () => {
    const frozenAfter = { status: 'frozen' as const, startAt: at(2026, 10, 1), endAt: at(2026, 11, 7), frozenFrom: at(2026, 10, 10), frozenUntil: at(2026, 10, 17), freezeCredit: 7 * DAY_MS };
    const r = rel({
      subscription: term({ endAt: at(2026, 11, 3) }),
      subscriptionEvents: [
        { at: at(2026, 10, 5), op: 'freeze', actorRole: 'coach', before: null, after: frozenAfter },
        { at: at(2026, 10, 13, 15), op: 'unfreeze', actorRole: 'coach', before: frozenAfter, after: { ...frozenAfter, status: 'active', frozenFrom: null, frozenUntil: null, freezeCredit: null, endAt: at(2026, 11, 3) } },
      ],
    });
    expect(unauthorizedWindows(r).filter((w) => w.rule === 'U3')).toEqual([{ start: at(2026, 10, 10), end: at(2026, 10, 13, 15), rule: 'U3' }]);
    expect(unauthorizedDay([r], '2026-10-11')?.rule).toBe('U3');
    expect(unauthorizedDay([r], '2026-10-15')).toBeNull();
  });

  it('U4 — renewal gap: lapsed term until the renewal; a back-dated renewal narrows it; an early renewal leaves none', () => {
    const lapsed = { startAt: at(2026, 9, 1), endAt: at(2026, 10, 1), status: 'expired' as const, endedAt: at(2026, 10, 10) };
    const gap = [rel({ subscription: term({ startAt: at(2026, 10, 10), endAt: at(2026, 11, 10) }), subscriptionHistory: [lapsed] })];
    expect(unauthorizedDay(gap, '2026-10-05')?.rule).toBe('U4');
    expect(unauthorizedDay(gap, '2026-09-20')).toBeNull();
    const backdated = [rel({ subscription: term({ startAt: at(2026, 10, 3), endAt: at(2026, 11, 3) }), subscriptionHistory: [lapsed] })];
    expect(unauthorizedDay(backdated, '2026-10-05')).toBeNull();
    const early = [rel({ subscription: term({ startAt: at(2026, 10, 1), endAt: at(2026, 11, 1) }), subscriptionHistory: [{ ...lapsed, status: 'ended' as const, endAt: at(2026, 9, 25), endedAt: at(2026, 9, 25) }] })];
    expect(unauthorizedDay(early, '2026-09-28')).toBeNull();
  });

  it('U4 — a SECOND, back-dated renewal also covers the gap (any later term start counts)', () => {
    const lapsed = { startAt: at(2026, 9, 1), endAt: at(2026, 10, 1), status: 'expired' as const, endedAt: at(2026, 10, 10) };
    const firstRenewal = { startAt: at(2026, 10, 10), endAt: at(2026, 10, 12), status: 'ended' as const, endedAt: at(2026, 10, 12) };
    const rels = [rel({ subscription: term({ startAt: at(2026, 10, 2), endAt: at(2026, 11, 2) }), subscriptionHistory: [lapsed, firstRenewal] })];
    expect(unauthorizedDay(rels, '2026-10-05')).toBeNull();
  });

  it('U5 — a later renewal back-dated over an extension lapse narrows it', () => {
    const snap = (endAt: number, startAt = at(2026, 9, 1)) => ({ status: 'active' as const, startAt, endAt, frozenFrom: null, frozenUntil: null, freezeCredit: null });
    const r = rel({
      subscription: term({ startAt: at(2026, 10, 3), endAt: at(2026, 11, 3) }),
      subscriptionEvents: [
        { at: at(2026, 10, 10), op: 'extend', actorRole: 'coach', before: snap(at(2026, 10, 1)), after: snap(at(2026, 11, 9)) },
        { at: at(2026, 10, 12), op: 'setTerm', actorRole: 'coach', before: snap(at(2026, 11, 9)), after: snap(at(2026, 11, 3), at(2026, 10, 3)) },
      ],
    });
    expect(unauthorizedWindows(r).find((w) => w.rule === 'U5')).toEqual({ start: at(2026, 10, 1), end: at(2026, 10, 3), rule: 'U5' });
    expect(unauthorizedDay([r], '2026-10-05')).toBeNull();
  });

  it('U5 — an extension of a lapsed term leaves the lapse visible', () => {
    const r = rel({
      subscription: term({ endAt: at(2026, 11, 9) }),
      subscriptionEvents: [
        { at: at(2026, 10, 10), op: 'extend', actorRole: 'coach', before: { status: 'active', startAt: at(2026, 9, 1), endAt: at(2026, 10, 1), frozenFrom: null, frozenUntil: null, freezeCredit: null }, after: { status: 'active', startAt: at(2026, 9, 1), endAt: at(2026, 11, 9), frozenFrom: null, frozenUntil: null, freezeCredit: null } },
      ],
    });
    expect(unauthorizedDay([r], '2026-10-05')?.rule).toBe('U5');
    expect(unauthorizedDay([r], '2026-10-12')).toBeNull();
  });

  it('windows are clipped to the relationship lifetime: after a release (no coach) logging is free again', () => {
    const released = rel({ status: 'ended', endedAt: at(2026, 10, 15), subscription: term({ endAt: at(2026, 10, 1) }) });
    expect(unauthorizedDay([released], '2026-10-05')?.rule).toBe('U1');
    expect(unauthorizedDay([released], '2026-10-20')).toBeNull();
    // Re-assigned later: the old relationship's lapse stays, the new term covers its own period.
    const next = rel({ _id: 'coach-2__client-1', coachId: 'coach-2', createdAt: at(2026, 11, 1), subscription: term({ startAt: at(2026, 11, 1), endAt: at(2026, 12, 1) }) });
    expect(unauthorizedDay([released, next], '2026-10-05')?.rule).toBe('U1');
    expect(unauthorizedDay([released, next], '2026-11-10')).toBeNull();
  });

  it('a "keep" transfer with the term still running leaves no gap on either side', () => {
    const sub = term({ endAt: at(2026, 11, 30) });
    const oldRel = rel({ status: 'ended', endedAt: at(2026, 10, 20), endReason: 'transferred', subscription: sub });
    const newRel = rel({ _id: 'coach-2__client-1', coachId: 'coach-2', createdAt: at(2026, 10, 20), subscription: sub });
    for (const d of ['2026-10-10', '2026-10-20', '2026-11-15']) expect(unauthorizedDay([oldRel, newRel], d)).toBeNull();
    expect(unauthorizedDay([oldRel, newRel], '2026-12-05')?.rule).toBe('U1');
  });

  it('a malformed day is never judged here (the contract already rejects it)', () => {
    expect(unauthorizedDay([rel()], 'not-a-day')).toBeNull();
  });
});
