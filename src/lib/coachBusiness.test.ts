import { describe, expect, it } from 'vitest';
import { businessSummary, clientExportRels, dayRange, monthRange, termExportRows, termsOf } from './coachBusiness';
import type { CoachClientRelationship, Subscription } from '../types';

/**
 * B3.8 Business rules (owner D1 / D2 / D3) — every inclusion and exclusion rule of Booked, Due,
 * Lost, the named lists, the package-state counts and the export rows.
 */
const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 15); // mid-October, this device's time zone

const sub = (p: Partial<Subscription> = {}): Subscription => ({ startAt: at(2026, 10, 1), endAt: at(2026, 11, 1), status: 'active', price: 900, currency: 'EGP', updatedAt: at(2026, 10, 1), ...p });
let n = 0;
const rel = (p: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({
  id: `r${++n}`,
  coachId: 'coach',
  clientId: `c${n}`,
  status: 'active',
  createdBy: 'coach',
  createdAt: at(2026, 9, 1),
  updatedAt: at(2026, 9, 1),
  ...p,
});
const egp = (rels: CoachClientRelationship[]) => businessSummary(rels, NOW).money.find((l) => l.currency === 'EGP');

describe('month', () => {
  it('is the calendar month around now, in this device’s time zone', () => {
    const m = monthRange(NOW);
    expect(m.start).toBe(new Date(2026, 9, 1).getTime());
    expect(m.end).toBe(new Date(2026, 10, 1).getTime() - 1);
  });
});

describe('Booked — terms that started this month, any relationship', () => {
  it('counts the current term, archived terms and earlier stints; never a pending, free or earlier term', () => {
    const rels = [
      rel({ subscription: sub({ startAt: at(2026, 10, 3), endAt: at(2026, 10, 10), price: 500 }) }),
      rel({ subscription: sub({ startAt: at(2026, 9, 20), endAt: at(2026, 10, 20) }), subscriptionHistory: [{ startAt: at(2026, 10, 2), endAt: at(2026, 10, 4), price: 300, currency: 'EGP', status: 'ended', endedAt: at(2026, 10, 4) }] }),
      rel({ subscription: sub({ startAt: at(2026, 9, 1) }) }), // started last month
      rel({ subscription: sub({ status: 'pending', startAt: at(2026, 10, 5) }) }), // not started
      rel({ subscription: sub({ startAt: at(2026, 10, 6), price: 0 }) }), // free
      rel({ subscription: sub({ startAt: at(2026, 10, 7), price: undefined }) }), // no price
      rel({ status: 'ended', endedAt: at(2026, 10, 12), subscription: sub({ startAt: at(2026, 10, 1), price: 200 }) }), // a former client still booked it
      rel({ previousStints: [{ status: 'ended', createdAt: at(2026, 9, 1), updatedAt: at(2026, 10, 9), archivedAt: at(2026, 10, 9), subscription: sub({ startAt: at(2026, 10, 1), price: 100 }) }], subscription: sub({ startAt: at(2026, 10, 9), price: 50 }) }),
    ];
    const l = egp(rels)!;
    expect(l.booked).toBe(500 + 300 + 200 + 100 + 50);
    expect(l.bookedTerms).toBe(5);
  });
});

describe('Due — running terms of current clients that end by month end', () => {
  it('counts active / trial terms ending after now and by the month’s last day; D1: never a former client’s term', () => {
    const rels = [
      rel({ subscription: sub({ endAt: at(2026, 10, 25), price: 900 }) }),
      rel({ subscription: sub({ status: 'trial', endAt: at(2026, 10, 31, 23), price: 100 }) }),
      rel({ subscription: sub({ endAt: at(2026, 11, 2) }) }), // next month
      rel({ subscription: sub({ endAt: at(2026, 10, 14) }) }), // already ran out
      rel({ subscription: sub({ status: 'frozen', frozenFrom: at(2026, 10, 1), frozenUntil: at(2026, 10, 30), freezeCredit: 0, endAt: at(2026, 10, 28) }) }), // paused
      rel({ status: 'ended', endedAt: at(2026, 10, 10), endReason: 'released', subscription: sub({ endAt: at(2026, 10, 25), price: 700 }) }), // released — not due
    ];
    const l = egp(rels)!;
    expect(l.due).toBe(1000);
    expect(l.dueTerms).toBe(2);
  });
});

describe('Lost — terms that ran out or were cancelled this month while still a client', () => {
  it('counts expired and cancelled current terms; never earlier months, ended-by-decision terms, or a release', () => {
    const rels = [
      rel({ subscription: sub({ endAt: at(2026, 10, 10), price: 400 }) }), // ran out this month
      rel({ subscription: sub({ status: 'cancelled', cancelledAt: at(2026, 10, 5), endAt: at(2026, 11, 20), price: 600 }) }),
      rel({ subscription: sub({ endAt: at(2026, 9, 28), price: 999 }) }), // last month
      rel({ subscription: sub({ status: 'ended', endAt: at(2026, 10, 3), price: 999 }) }), // ended — not a lapse
      rel({ status: 'ended', endedAt: at(2026, 10, 4), endReason: 'released', subscription: sub({ endAt: at(2026, 10, 12), price: 999 }) }), // released while running
      rel({ status: 'ended', endedAt: at(2026, 10, 12), endReason: 'transferred', subscription: sub({ endAt: at(2026, 10, 8), price: 50 }) }), // ran out, then left
    ];
    const l = egp(rels)!;
    expect(l.lost).toBe(400 + 600 + 50);
    expect(l.lostTerms).toBe(3);
  });

  it('a renewed client is not lost: only the current term is checked (archived terms were followed by a renewal)', () => {
    const r = rel({ subscription: sub({ startAt: at(2026, 10, 10), endAt: at(2026, 11, 10) }), subscriptionHistory: [{ startAt: at(2026, 9, 10), endAt: at(2026, 10, 10), price: 900, currency: 'EGP', status: 'ended', endedAt: at(2026, 10, 10) }] });
    expect(egp([r])!.lost).toBe(0);
  });
});

describe('currencies — never added together', () => {
  it('one line per currency, EGP first; a priced term without a currency is EGP (EGP-only, B3.8); lines with nothing are dropped', () => {
    const rels = [
      rel({ subscription: sub({ startAt: at(2026, 10, 2), price: 900, currency: 'EGP' }) }),
      rel({ subscription: sub({ startAt: at(2026, 10, 2), price: 50, currency: 'usd' }) }),
      rel({ subscription: sub({ startAt: at(2026, 10, 2), price: 10, currency: undefined }) }),
      rel({ subscription: sub({ startAt: at(2026, 9, 2), endAt: at(2026, 12, 1), price: 70, currency: 'SAR' }) }), // nothing this month
    ];
    const money = businessSummary(rels, NOW).money;
    expect(money.map((l) => [l.currency, l.booked])).toEqual([['EGP', 910], ['USD', 50]]);
  });
});

describe('current clients — counts and named lists (D1: active relationships only)', () => {
  it('counts every current client once by the Clients filter states; former clients are not counted', () => {
    const rels = [
      rel({ subscription: sub({ endAt: at(2026, 12, 1) }) }),
      rel({ subscription: sub({ status: 'trial', endAt: at(2026, 12, 1) }) }),
      rel({ subscription: sub({ endAt: at(2026, 10, 18) }) }), // expiring (≤ 7 days)
      rel({ subscription: sub({ endAt: at(2026, 10, 1) }) }), // expired
      rel({}), // no package
      rel({ status: 'ended', endedAt: at(2026, 10, 1), subscription: sub({ endAt: at(2026, 12, 1) }) }),
    ];
    expect(businessSummary(rels, NOW).counts).toEqual({ active: 1, trial: 1, expiring: 1, paused: 0, expired: 1, pending: 0, none: 1 });
  });

  it('renewals: running terms ending within 30 days, soonest first, free ones too; "soon" within 7 days', () => {
    const a = rel({ subscription: sub({ endAt: NOW + 20 * DAY, price: undefined, planName: 'Monthly' }) });
    const b = rel({ subscription: sub({ status: 'trial', endAt: NOW + 3 * DAY }) });
    const late = rel({ subscription: sub({ endAt: NOW + 40 * DAY }) });
    const former = rel({ status: 'ended', endedAt: NOW - DAY, subscription: sub({ endAt: NOW + 2 * DAY }) });
    const { renewals } = businessSummary([a, b, late, former], NOW);
    expect(renewals.map((r) => [r.clientId, r.daysLeft, r.soon, r.trial])).toEqual([
      [b.clientId, 3, true, true],
      [a.clientId, 20, false, false],
    ]);
    expect(renewals[1].planName).toBe('Monthly');
  });

  it('lapsed: Today’s rule — ran out by itself within 30 days; never cancelled / ended terms or former clients', () => {
    const recent = rel({ subscription: sub({ endAt: NOW - 2 * DAY }) });
    const older = rel({ subscription: sub({ endAt: NOW - 31 * DAY }) });
    const cancelled = rel({ subscription: sub({ status: 'cancelled', cancelledAt: NOW - DAY, endAt: NOW - DAY }) });
    const former = rel({ status: 'ended', endedAt: NOW, subscription: sub({ endAt: NOW - DAY }) });
    const yesterday = rel({ subscription: sub({ endAt: NOW - 1 * DAY }) });
    const { lapsed } = businessSummary([recent, older, cancelled, former, yesterday], NOW);
    expect(lapsed.map((r) => [r.clientId, r.daysAgo])).toEqual([
      [yesterday.clientId, 1],
      [recent.clientId, 2],
    ]);
  });
});

describe('exports', () => {
  it('a date range is inclusive, by day, open-ended when empty; anything else is ignored', () => {
    const r = dayRange('2026-10-01', '2026-10-31');
    expect(r.from).toBe(new Date(2026, 9, 1).getTime());
    expect(r.to).toBe(new Date(2026, 10, 1).getTime() - 1);
    expect(dayRange('', '')).toEqual({ from: null, to: null });
    expect(dayRange('nonsense', '2026-13-99').from).toBeNull();
  });

  it('term rows: every term of every relationship that started in the range, newest first, with what it is', () => {
    const current = rel({ clientId: 'cur', subscription: sub({ startAt: at(2026, 10, 10), endAt: at(2026, 10, 12), planName: 'Monthly' }), subscriptionHistory: [{ startAt: at(2026, 8, 10), endAt: at(2026, 9, 10), months: 1, price: 800, currency: 'EGP', status: 'ended', endedAt: at(2026, 9, 10) }] });
    const former = rel({ clientId: 'old', status: 'ended', endedAt: at(2026, 9, 30), subscription: sub({ startAt: at(2026, 9, 1), endAt: at(2026, 10, 1) }) });
    const rows = termExportRows([current, former], dayRange('2026-09-01', ''), NOW);
    expect(rows.map((r) => [r.clientId, r.currentClient, r.currentTerm, r.status, r.planName ?? null, r.relationshipEndedAt ?? null])).toEqual([
      ['cur', true, true, 'expired', 'Monthly', null], // ran out on the 12th: the current term's effective status
      ['old', false, true, 'expired', null, at(2026, 9, 30)],
    ]);
    expect(termExportRows([current], dayRange('', ''), NOW)).toHaveLength(2);
    expect(termsOf(current)).toHaveLength(2);
  });

  it('client rows: current clients added inside the range, oldest first', () => {
    const a = rel({ createdAt: at(2026, 3, 1) });
    const b = rel({ createdAt: at(2026, 10, 2) });
    const gone = rel({ status: 'ended', createdAt: at(2026, 10, 3) });
    expect(clientExportRels([b, gone, a], dayRange('', '')).map((r) => r.id)).toEqual([a.id, b.id]);
    expect(clientExportRels([b, gone, a], dayRange('2026-10-01', '')).map((r) => r.id)).toEqual([b.id]);
  });
});
