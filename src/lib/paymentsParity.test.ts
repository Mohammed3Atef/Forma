import { describe, expect, it } from 'vitest';
import * as client from './payments';
import * as server from '../../api/payments/_ledger';

/** B3.8: the device and the server compute balances the same way (integers of piastres). */
const payments = [
  { kind: 'payment' as const, termId: 't1', amountMinor: 40_000 },
  { kind: 'payment' as const, termId: 't1', amountMinor: 35_050 },
  { kind: 'payment' as const, termId: 't1', amountMinor: 10_000, reversedById: 'r1' }, // voided
  { kind: 'reversal' as const, termId: 't1', amountMinor: 10_000 },
  { kind: 'payment' as const, termId: 't2', amountMinor: 99_999 },
  { kind: 'payment' as const, termId: null, amountMinor: 5_000 }, // not tied to a package
];

describe('payment ledger — device and server agree', () => {
  it('paid per term counts live payments only', () => {
    expect([...client.paidByTerm(payments)]).toEqual([...server.paidByTerm(payments)]);
    expect(client.paidByTerm(payments).get('t1')).toBe(75_050);
    expect(client.paidByTerm(payments).get('t2')).toBe(99_999);
  });

  it('balances never go negative; a credit is reported instead', () => {
    for (const [price, paid] of [[100_000, 75_050], [100_000, 100_000], [80_000, 100_000], [0, 0], [0, 500]]) {
      expect(client.balanceOf(price, paid)).toEqual(server.balanceOf(price, paid));
    }
    expect(client.balanceOf(80_000, 100_000)).toEqual({ outstandingMinor: 0, overpaidMinor: 20_000 });
  });

  it('prices become piastres without floating-point drift', () => {
    for (const p of [0.1, 0.2, 19.99, 1234.56, 999.995, 1e7, undefined, -5, 0]) expect(client.toMinor(p)).toBe(server.toMinor(p));
    expect(client.toMinor(19.99)).toBe(1999);
    expect(client.toMinor(0.1 + 0.2)).toBe(30);
  });

  it('typed amounts: whole piastres only', () => {
    expect(client.parseEgpToMinor(1250.5)).toBe(125_050);
    expect(client.parseEgpToMinor(0.01)).toBe(1);
    expect(client.parseEgpToMinor(10.005)).toBeNull();
    expect(client.parseEgpToMinor(0)).toBeNull();
    expect(client.parseEgpToMinor(-3)).toBeNull();
  });
});
