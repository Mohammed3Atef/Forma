import { describe, expect, it } from 'vitest';
import { effectiveSubscriptionStatus as clientRule, freezePending, freezeScheduled, isBackdatedRenewal, unfreezeEndAt } from './subscription';
import { effectiveSubscriptionStatus as serverRule } from '../../api/admin/_lib/subscription';
import { applyUnfreeze, isBackdatedRenewal as serverBackdated } from '../../api/coach-clients/_subscriptionRules';
import type { Subscription } from '@/types';

/**
 * B3.0.1 / B3-S07: the client (`src/lib/subscription.ts`) and server
 * (`api/admin/_lib/subscription.ts`) copies of the effective-status rule must
 * agree on every case — the app gates logging with one, the API reports and
 * enforces with the other. Shared vector, incl. scheduled (B3.0.1) and legacy
 * (pre-B3.0.1, never migrated) freezes.
 */
const DAY = 86_400_000;
const T = Date.UTC(2026, 9, 15);
const base: Subscription = { status: 'active', startAt: T - 10 * DAY, endAt: T + 20 * DAY, frozenFrom: null, frozenUntil: null, updatedAt: 1 };
const VECTOR: [string, Subscription | null][] = [
  ['none', null],
  ['active', base],
  ['trial', { ...base, status: 'trial' }],
  ['lapsed active', { ...base, endAt: T - DAY }],
  ['lapsed trial', { ...base, status: 'trial', endAt: T - DAY }],
  ['pending', { ...base, status: 'pending' }],
  ['stored expired', { ...base, status: 'expired' }],
  ['cancelled', { ...base, status: 'cancelled', cancelledAt: T - DAY }],
  ['ended', { ...base, status: 'ended', endAt: T - DAY }],
  ['scheduled freeze (future)', { ...base, status: 'frozen', frozenFrom: T + 2 * DAY, frozenUntil: T + 5 * DAY, freezeCredit: 3 * DAY }],
  ['scheduled freeze (running)', { ...base, status: 'frozen', frozenFrom: T - DAY, frozenUntil: T + 2 * DAY, freezeCredit: 3 * DAY }],
  ['scheduled freeze (finished)', { ...base, status: 'frozen', frozenFrom: T - 5 * DAY, frozenUntil: T - 2 * DAY, freezeCredit: 3 * DAY }],
  ['scheduled freeze (finished, lapsed)', { ...base, status: 'frozen', frozenFrom: T - 9 * DAY, frozenUntil: T - 6 * DAY, freezeCredit: 3 * DAY, endAt: T - DAY }],
  ['legacy freeze (future dates)', { ...base, status: 'frozen', frozenFrom: T + 2 * DAY, frozenUntil: T + 5 * DAY }],
  ['legacy freeze (open-ended)', { ...base, status: 'frozen', frozenFrom: T - DAY, frozenUntil: null }],
  ['legacy freeze (over)', { ...base, status: 'frozen', frozenFrom: T - 5 * DAY, frozenUntil: T - 2 * DAY }],
];
const EXPECTED: Record<string, string> = {
  none: 'none',
  active: 'active',
  trial: 'trial',
  'lapsed active': 'expired',
  'lapsed trial': 'expired',
  pending: 'pending',
  'stored expired': 'expired',
  cancelled: 'cancelled',
  ended: 'ended',
  'scheduled freeze (future)': 'active',
  'scheduled freeze (running)': 'frozen',
  'scheduled freeze (finished)': 'active',
  'scheduled freeze (finished, lapsed)': 'expired',
  'legacy freeze (future dates)': 'frozen',
  'legacy freeze (open-ended)': 'frozen',
  'legacy freeze (over)': 'active',
};

describe('effectiveSubscriptionStatus — client and server copies agree (shared vector)', () => {
  for (const [name, sub] of VECTOR) {
    it(`${name} → ${EXPECTED[name]}`, () => {
      expect(clientRule(sub, T)).toBe(EXPECTED[name]);
      expect(serverRule(sub as never, T)).toBe(clientRule(sub, T));
    });
  }
  it('agrees across time as well (every vector entry, a month either side)', () => {
    for (const [, sub] of VECTOR) {
      for (let d = -30; d <= 30; d += 1) expect(serverRule(sub as never, T + d * DAY + 7 * 3_600_000)).toBe(clientRule(sub, T + d * DAY + 7 * 3_600_000));
    }
  });
});

describe('the panel previews exactly what the server will do (owner: end date shown before confirming)', () => {
  it('unfreeze end date: client preview = server result, for every freeze in the vector and every hour of a week', () => {
    for (const [, sub] of VECTOR) {
      if (!sub || sub.status !== 'frozen') continue;
      for (let h = -48; h <= 7 * 24; h += 1) {
        const now = T + h * 3_600_000;
        const server = applyUnfreeze(sub as never, now);
        expect(server.ok).toBe(true);
        if (server.ok) expect(unfreezeEndAt(sub, now)).toBe(server.next.endAt);
      }
    }
  });
  it('back-dated renewal: client check = server flag', () => {
    const starts = [T - 30 * DAY, T - 12 * DAY, T - 2 * DAY, T - DAY + 1, T, T + 5 * DAY];
    for (const [, sub] of VECTOR) {
      for (const s of starts) expect(isBackdatedRenewal(sub, s, T)).toBe(serverBackdated(sub as never, s, T));
    }
    expect(isBackdatedRenewal(VECTOR.find(([n]) => n === 'lapsed active')![1], T - 3 * DAY, T)).toBe(true);
    expect(isBackdatedRenewal(VECTOR.find(([n]) => n === 'active')![1], T - 10 * DAY, T)).toBe(false); // re-saving the running term's own start
    expect(isBackdatedRenewal(VECTOR.find(([n]) => n === 'active')![1], T - 20 * DAY, T)).toBe(true); // moved earlier than the term's start
  });
});

describe('freeze helpers for the coach panel', () => {
  const sub = (name: string) => VECTOR.find(([n]) => n === name)![1];
  it('scheduled = a B3.0.1 freeze that has not started; pending = scheduled or in force', () => {
    expect(freezeScheduled(sub('scheduled freeze (future)'), T)).toBe(true);
    expect(freezeScheduled(sub('scheduled freeze (running)'), T)).toBe(false);
    expect(freezeScheduled(sub('legacy freeze (future dates)'), T)).toBe(false);
    expect(freezePending(sub('scheduled freeze (future)'), T)).toBe(true);
    expect(freezePending(sub('scheduled freeze (running)'), T)).toBe(true);
    expect(freezePending(sub('scheduled freeze (finished)'), T)).toBe(false);
    expect(freezePending(sub('legacy freeze (open-ended)'), T)).toBe(true);
    expect(freezePending(sub('active'), T)).toBe(false);
  });
});
