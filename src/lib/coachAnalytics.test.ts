import { describe, expect, it } from 'vitest';
import { businessAnalytics, lastMonths } from './coachAnalytics';
import type { ClientPayment, CoachClientRelationship, Subscription, SubscriptionPeriod } from '../types';

/**
 * B3.8 completion (owner decision 5): every Business analytics figure, pinned. Integers of
 * piastres; EGP only; booked ≠ collected; outstanding from terms with an id and live payments.
 */
const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 10, 15);
const key = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const term = (start: string, p: Partial<Subscription> = {}): Subscription => {
  const [y, m, d] = start.split('-').map(Number);
  const s = new Date(y, m - 1, d).getTime();
  const e = new Date(y, m - 1, d + 30).getTime();
  return { status: 'active', startDate: start, endDate: key(e), days: 30, months: 1, startAt: s, endAt: e, price: 1000, currency: 'EGP', updatedAt: 1, ...p };
};
let n = 0;
const rel = (p: Partial<CoachClientRelationship> = {}): CoachClientRelationship => ({ id: `c__x${(n += 1)}`, coachId: 'c', clientId: `x${n}`, status: 'active', createdBy: 'c', createdAt: 1, updatedAt: 1, ...p });
const pay = (p: Partial<ClientPayment>): ClientPayment => ({ id: `p${(n += 1)}`, kind: 'payment', coachId: 'c', clientId: 'x', relationshipId: 'c__x', termId: null, amountMinor: 10_000, currency: 'EGP', method: 'cash', paidAt: NOW - DAY, requestId: `r${n}`, createdBy: 'c', createdByRole: 'coach', createdAt: 1, ...p });

describe('booked vs collected — never the same thing', () => {
  it('booked by the term’s first day; collected by the day received; reversed payments count nowhere', () => {
    const rels = [
      rel({ subscription: term('2026-10-03', { termId: 't1', price: 1000 }) }),
      rel({ subscription: term('2026-09-20', { termId: 't2', price: 800 }) }),
    ];
    const payments = [
      pay({ termId: 't1', amountMinor: 40_000, method: 'instapay', paidAt: at(2026, 10, 4) }),
      pay({ termId: 't2', amountMinor: 80_000, method: 'cash', paidAt: at(2026, 9, 20) }),
      pay({ id: 'bad', termId: 't1', amountMinor: 60_000, reversedById: 'rev' }),
      pay({ id: 'rev', kind: 'reversal', reversesId: 'bad', termId: 't1', amountMinor: 60_000, paidAt: at(2026, 10, 10) }),
    ];
    const a = businessAnalytics(rels, payments, NOW);
    expect(a).toMatchObject({ bookedAllMinor: 180_000, bookedMonthMinor: 100_000, bookedMonthTerms: 1, collectedAllMinor: 120_000, collectedMonthMinor: 40_000, collectedMonthCount: 1, reversedMonthMinor: 60_000, reversedMonthCount: 1 });
    expect(a.trend.at(-1)).toEqual({ key: '2026-10', bookedMinor: 100_000, collectedMinor: 40_000 });
    expect(a.trend.at(-2)).toEqual({ key: '2026-09', bookedMinor: 80_000, collectedMinor: 80_000 });
    expect(a.methodsMonth).toEqual([{ method: 'cash', minor: 0, count: 0 }, { method: 'mobile_wallet', minor: 0, count: 0 }, { method: 'instapay', minor: 40_000, count: 1 }]);
    expect(a.methodsAll.map((m) => m.minor)).toEqual([80_000, 0, 40_000]);
  });

  it('a renewal is booked in its own month; a corrected term once; a pending placeholder never', () => {
    const renewed: SubscriptionPeriod = { ...term('2026-09-01', { termId: 'old', price: 900 }), status: 'ended', endedAt: at(2026, 9, 25), archivedBy: 'renew' };
    const rels = [rel({ subscription: term('2026-10-01', { termId: 'new', price: 950 }), subscriptionHistory: [renewed] }), rel({ subscription: { status: 'pending', startAt: NOW, endAt: NOW, price: 500, updatedAt: 1 } })];
    const a = businessAnalytics(rels, [], NOW);
    expect(a.bookedAllMinor).toBe(185_000);
    expect(a.bookedMonthMinor).toBe(95_000);
  });
});

describe('outstanding — what is still owed, never negative', () => {
  it('overdue once a term has started; not yet due before; a credit when paid beyond a lowered price', () => {
    const rels = [
      rel({ subscription: term('2026-10-01', { termId: 'started', price: 1000 }) }),
      rel({ subscription: term('2026-11-01', { termId: 'future', price: 1200 }) }),
      rel({ subscription: term('2026-10-05', { termId: 'over', price: 500 }) }),
      rel({ status: 'ended', endedAt: at(2026, 10, 10), subscription: term('2026-09-10', { termId: 'former', price: 700 }) }), // a former client still owes
    ];
    const payments = [pay({ termId: 'started', amountMinor: 30_000 }), pay({ termId: 'over', amountMinor: 60_000 })];
    const a = businessAnalytics(rels, payments, NOW);
    expect(a.overdueMinor).toBe(70_000 + 70_000);
    expect(a.notYetDueMinor).toBe(120_000);
    expect(a.outstandingMinor).toBe(260_000);
    expect(a.overpaidMinor).toBe(10_000);
    expect(a.owingTerms).toBe(3);
  });

  it('a payment not linked to a package: in collected (month, all time, methods, trend), never taken off outstanding, counted as unlinked; a reversed one counts nowhere', () => {
    const rels = [rel({ subscription: term('2026-10-01', { termId: 'owes', price: 1000 }) })];
    const payments = [
      pay({ termId: null, amountMinor: 40_000, method: 'mobile_wallet', paidAt: at(2026, 10, 3) }),
      pay({ termId: 'owes', amountMinor: 10_000, paidAt: at(2026, 10, 4) }),
      pay({ id: 'gone', termId: null, amountMinor: 5_000, reversedById: 'rv' }),
      pay({ id: 'rv', kind: 'reversal', reversesId: 'gone', termId: null, amountMinor: 5_000, paidAt: at(2026, 10, 5) }),
    ];
    const a = businessAnalytics(rels, payments, NOW);
    expect(a).toMatchObject({ collectedMonthMinor: 50_000, collectedAllMinor: 50_000, collectedMonthCount: 2, unlinkedMinor: 40_000, unlinkedCount: 1, outstandingMinor: 90_000, overdueMinor: 90_000 });
    expect(a.methodsMonth.find((m) => m.method === 'mobile_wallet')).toEqual({ method: 'mobile_wallet', minor: 40_000, count: 1 });
    expect(a.trend.at(-1)?.collectedMinor).toBe(50_000);
    expect(businessAnalytics(rels, [], NOW)).toMatchObject({ unlinkedMinor: 0, unlinkedCount: 0 });
  });

  it('terms from before B3.8 (no id) cannot hold payments: left out of outstanding and counted', () => {
    const a = businessAnalytics([rel({ subscription: term('2026-10-01', { price: 1000 }) })], [], NOW);
    expect(a.outstandingMinor).toBe(0);
    expect(a.untrackedTerms).toBe(1);
    expect(a.bookedMonthMinor).toBe(100_000); // still booked
  });

  it('EGP only: a pre-B3.8 term in another currency is never added to EGP', () => {
    const a = businessAnalytics([rel({ subscription: term('2026-10-01', { termId: 'usd', price: 50, currency: 'USD' }) }), rel({ subscription: term('2026-10-02', { termId: 'egp', price: 900, currency: undefined }) })], [], NOW);
    expect(a.bookedMonthMinor).toBe(90_000);
    expect(a.otherCurrencyTerms).toBe(1);
  });
});

describe('current clients — paying, renewing, on which package', () => {
  it('active paying: running, priced, not a trial (a paused paying client counts)', () => {
    const rels = [
      rel({ subscription: term('2026-10-01', { termId: 'a' }) }),
      rel({ subscription: term('2026-10-01', { termId: 'b', status: 'trial', price: 0 }) }),
      rel({ subscription: term('2026-10-01', { termId: 'c', status: 'frozen', frozenFrom: NOW - DAY, frozenUntil: NOW + DAY, freezeCredit: 2 * DAY }) }),
      rel({ subscription: term('2026-08-01', { termId: 'd' }) }), // ran out
      rel({ status: 'ended', endedAt: NOW - DAY, subscription: term('2026-10-01', { termId: 'e' }) }), // former client
      rel({ subscription: term('2026-10-01', { termId: 'f', price: undefined, currency: undefined }) }), // free
    ];
    expect(businessAnalytics(rels, [], NOW).activePaying).toBe(2);
  });

  it('renewal pipeline: lapsed (overdue), this week, next week, later this month — counts and EGP value', () => {
    const ends = (days: number) => term(key(NOW + days * DAY - 30 * DAY), { termId: `t${days}`, endAt: NOW + days * DAY });
    const rels = [rel({ subscription: ends(3) }), rel({ subscription: ends(10) }), rel({ subscription: ends(25) }), rel({ subscription: ends(-4) }), rel({ subscription: ends(40) })];
    const p = businessAnalytics(rels, [], NOW).pipeline;
    expect(p.map((r) => [r.key, r.count, r.minor])).toEqual([['overdue', 1, 100_000], ['week', 1, 100_000], ['twoWeeks', 1, 100_000], ['month', 1, 100_000]]);
  });

  it('packages: current clients on a running term by package name, most-used first, a custom term named as such, the tail folded', () => {
    const on = (name: string | undefined, price = 1000) => rel({ subscription: term('2026-10-01', { termId: `${name}${(n += 1)}`, planName: name, price }) });
    const rels = [on('Monthly'), on('Monthly'), on('Quarterly', 2400), on(undefined), on('A'), on('B'), on('C')];
    const pk = businessAnalytics(rels, [], NOW).packages;
    expect(pk[0]).toEqual({ name: 'Monthly', clients: 2, minor: 200_000 });
    expect(pk.find((r) => r.name === null && !r.other)).toEqual({ name: null, clients: 1, minor: 100_000 });
    expect(pk).toHaveLength(6);
    expect(pk.at(-1)).toMatchObject({ other: true, clients: 1 });
  });
});

describe('the trend window', () => {
  it('twelve calendar months on this device, oldest first, ending with this month', () => {
    const m = lastMonths(NOW);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-11');
    expect(m.at(-1)).toBe('2026-10');
    expect(lastMonths(at(2026, 1, 15), 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('nothing at all → zeros, not errors', () => {
    const a = businessAnalytics([], [], NOW);
    expect(a.trend.every((p) => p.bookedMinor === 0 && p.collectedMinor === 0)).toBe(true);
    expect(a.packages).toEqual([]);
    expect(a.outstandingMinor).toBe(0);
  });
});
