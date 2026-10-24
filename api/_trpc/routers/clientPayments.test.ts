import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import { addDays, startOfDay, todayIn } from '../../_lib/civilDate.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc, SubscriptionDoc } from '../../coach-clients/_types.js';
import type { ClientPaymentDoc } from '../../payments/_types.js';
import { balanceOf, paidByTerm, termsOfRelationship } from '../../payments/_ledger.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B3.8 (owner decision 1) — the manual payment ledger: full / partial / multiple payments, no
 * overpayment, idempotent retries, races, reversals once, atomic corrections, ownership.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_client_payments';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
const CAIRO = 'Africa/Cairo';
const REL = 'coach-1__client-1';
const today = () => todayIn(CAIRO);

function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id); // B38F-R3: a real coach always has a plan
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const as = (u: AuthedUser) => appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
const term = (start: string, over: Partial<SubscriptionDoc> = {}): SubscriptionDoc => {
  const end = addDays(start, 30);
  return { status: 'active', startDate: start, endDate: end, days: 30, months: 1, zone: CAIRO, startAt: startOfDay(start, CAIRO), endAt: startOfDay(end, CAIRO), price: 1000, currency: 'EGP', termId: 'term-1', frozenFrom: null, frozenUntil: null, updatedAt: 1, ...over };
};
async function world(sub: SubscriptionDoc | undefined = term(addDays(today(), -5))) {
  const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
  const other = await insertUser({ _id: 'coach-2', role: 'coach' });
  const client = await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
  const admin = await insertUser({ _id: 'admin-1', role: 'admin', permissions: ['users.read'] });
  const now = Date.now();
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: REL, coachId: 'coach-1', clientId: 'client-1', status: 'active', createdBy: 'coach-1', createdAt: now - 60 * DAY, updatedAt: now, ...(sub ? { subscription: sub } : {}) });
  return { coach, other, client, admin };
}
let n = 0;
const rid = () => `req-${Date.now()}-${(n += 1)}`;
const pay = (u: AuthedUser, amountMinor: number, extra: Record<string, unknown> = {}) =>
  as(u).clientPayments.record({ clientId: 'client-1', termId: 'term-1', amountMinor, method: 'cash', paidAt: Date.now(), requestId: rid(), ...extra } as never);
const all = async () => (await getDb()).collection<ClientPaymentDoc>('clientPayments').find({}).toArray();
const paid = async (termId = 'term-1') => paidByTerm(await all()).get(termId) ?? 0;

describe('recording — full, partial, several; never more than is owed', () => {
  it('a full payment settles the term; another payment is refused', async () => {
    const { coach } = await world();
    const p = await pay(coach, 100_000, { method: 'instapay', reference: 'IP-778' });
    expect(p).toMatchObject({ kind: 'payment', amountMinor: 100_000, currency: 'EGP', method: 'instapay', termId: 'term-1', reference: 'IP-778', createdBy: 'coach-1' });
    expect(balanceOf(100_000, await paid())).toEqual({ outstandingMinor: 0, overpaidMinor: 0 });
    expect(await reasonOf(pay(coach, 1))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_EXCEEDS_BALANCE' });
  });

  it('partial payments add up; each is checked against what is left', async () => {
    const { coach } = await world();
    await pay(coach, 40_000);
    await pay(coach, 35_050, { method: 'mobile_wallet' });
    expect(balanceOf(100_000, await paid())).toEqual({ outstandingMinor: 24_950, overpaidMinor: 0 });
    expect(await reasonOf(pay(coach, 24_951))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_EXCEEDS_BALANCE' });
    await pay(coach, 24_950);
    expect(await paid()).toBe(100_000);
  });

  it('dates in the future, fractions of a piastre and unknown methods are refused', async () => {
    const { coach } = await world();
    expect((await reasonOf(pay(coach, 100, { paidAt: Date.now() + DAY }))).code).toBe('BAD_REQUEST');
    expect((await reasonOf(pay(coach, 10.5))).code).toBe('BAD_REQUEST');
    expect((await reasonOf(pay(coach, 100, { method: 'card' }))).code).toBe('BAD_REQUEST');
    expect((await reasonOf(pay(coach, 0))).code).toBe('BAD_REQUEST');
  });

  it('a free package has nothing to pay; a payment not tied to a package is allowed', async () => {
    const { coach } = await world(term(addDays(today(), -5), { price: undefined, currency: undefined }));
    expect(await reasonOf(pay(coach, 100))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_EXCEEDS_BALANCE' });
    const loose = await pay(coach, 5_000, { termId: null });
    expect(loose.termId).toBeNull();
  });

  it('"current" on a term written before B3.8 gives that term its id, and the payment points at it', async () => {
    const { coach } = await world(term(addDays(today(), -5), { termId: undefined, startDate: undefined, endDate: undefined, days: undefined, zone: undefined }));
    const p = await pay(coach, 10_000, { termId: 'current' });
    const rel = await (await getDb()).collection<CoachClientDoc>('coachClients').findOne({ _id: REL });
    expect(rel!.subscription!.termId).toBeTruthy();
    expect(p.termId).toBe(rel!.subscription!.termId);
  });

  it('a late payment for the renewed (previous) term is still recorded against that term', async () => {
    const { coach } = await world();
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'renew', months: 1, price: 1200 } });
    const p = await pay(coach, 100_000, { termId: 'term-1' });
    expect(p.termId).toBe('term-1');
    const rel = await (await getDb()).collection<CoachClientDoc>('coachClients').findOne({ _id: REL });
    expect(termsOfRelationship(rel!).map((t) => [t.current, t.priceMinor])).toEqual([[true, 120_000], [false, 100_000]]);
  });

  it('a price corrected below what was paid shows a credit, never a negative balance; nothing more can be paid', async () => {
    const { coach } = await world();
    await pay(coach, 100_000);
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'correct', price: 800 } });
    expect(balanceOf(80_000, await paid())).toEqual({ outstandingMinor: 0, overpaidMinor: 20_000 });
    expect(await reasonOf(pay(coach, 1))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_EXCEEDS_BALANCE' });
  });
});

describe('retries and races', () => {
  it('a retried save (same request id) records once and returns the same record', async () => {
    const { coach } = await world();
    const input = { clientId: 'client-1', termId: 'term-1', amountMinor: 30_000, method: 'cash' as const, paidAt: Date.now(), requestId: 'req-same-0001' };
    const a = await as(coach).clientPayments.record(input);
    const b = await as(coach).clientPayments.record(input);
    expect(b._id).toBe(a._id);
    const racing = await Promise.all([1, 2, 3].map(() => as(coach).clientPayments.record({ ...input, requestId: 'req-same-0002' })));
    expect(new Set(racing.map((r) => r._id)).size).toBe(1);
    expect(await all()).toHaveLength(2);
  });

  it('two different payments racing for the last 600 EGP: one is recorded, the other refused', async () => {
    const { coach } = await world();
    await pay(coach, 40_000);
    const results = await Promise.allSettled([pay(coach, 60_000), pay(coach, 60_000)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect((lost.reason as { cause?: { reason?: string } }).cause?.reason).toBe('PAYMENT_EXCEEDS_BALANCE');
    expect(await paid()).toBe(100_000);
  });
});

describe('reversals and corrections — nothing is deleted or overwritten', () => {
  it('a reversal voids the payment (kept, marked) once; a second reversal is refused', async () => {
    const { coach } = await world();
    const p = await pay(coach, 50_000);
    const r = await as(coach).clientPayments.reverse({ paymentId: p._id, reason: 'Entered twice', requestId: rid() });
    expect(r).toMatchObject({ kind: 'reversal', reversesId: p._id, amountMinor: 50_000, reason: 'Entered twice' });
    const original = (await all()).find((x) => x._id === p._id)!;
    expect(original).toMatchObject({ reversedById: r._id, amountMinor: 50_000 });
    expect(await paid()).toBe(0);
    expect(await reasonOf(as(coach).clientPayments.reverse({ paymentId: p._id, reason: 'again', requestId: rid() }))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_ALREADY_REVERSED' });
    expect(await reasonOf(as(coach).clientPayments.reverse({ paymentId: r._id, reason: 'reverse the reversal', requestId: rid() }))).toEqual({ code: 'NOT_FOUND', reason: 'PAYMENT_NOT_FOUND' });
  });

  it('racing reversals of one payment: exactly one reversal exists', async () => {
    const { coach } = await world();
    const p = await pay(coach, 50_000);
    await Promise.allSettled([1, 2, 3].map(() => as(coach).clientPayments.reverse({ paymentId: p._id, reason: 'race', requestId: rid() })));
    expect((await all()).filter((x) => x.kind === 'reversal')).toHaveLength(1);
  });

  it('a correction reverses the wrong payment and records the right one, atomically', async () => {
    const { coach } = await world();
    const wrong = await pay(coach, 100_000, { method: 'cash' });
    const right = await as(coach).clientPayments.correct({ paymentId: wrong._id, reason: 'It was InstaPay, 900', termId: 'term-1', amountMinor: 90_000, method: 'instapay', paidAt: Date.now(), requestId: rid() });
    expect(right).toMatchObject({ kind: 'payment', amountMinor: 90_000, method: 'instapay', correctsId: wrong._id });
    expect((await all()).find((x) => x._id === wrong._id)!.reversedById).toBeTruthy();
    expect(await paid()).toBe(90_000);
  });

  it('a correction that would overpay changes nothing at all (the reversal rolls back too)', async () => {
    const { coach } = await world();
    const p = await pay(coach, 50_000);
    expect(await reasonOf(as(coach).clientPayments.correct({ paymentId: p._id, reason: 'x', termId: 'term-1', amountMinor: 100_001, method: 'cash', paidAt: Date.now(), requestId: rid() }))).toEqual({ code: 'CONFLICT', reason: 'PAYMENT_EXCEEDS_BALANCE' });
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0].reversedById).toBeUndefined();
  });
});

describe('ownership — only the coach’s own clients and terms', () => {
  it('another coach cannot record for, reverse, or read this coach’s client', async () => {
    const { coach, other, client } = await world();
    const p = await pay(coach, 10_000);
    expect((await reasonOf(as(other).clientPayments.record({ clientId: 'client-1', termId: 'term-1', amountMinor: 1, method: 'cash', paidAt: Date.now(), requestId: rid() }))).code).toBe('NOT_FOUND');
    expect(await reasonOf(as(other).clientPayments.reverse({ paymentId: p._id, reason: 'x', requestId: rid() }))).toEqual({ code: 'NOT_FOUND', reason: 'PAYMENT_NOT_FOUND' });
    expect((await reasonOf(as(other).clientPayments.list({ coachId: 'coach-1' }))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(client).clientPayments.list({}))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(client).clientPayments.record({ clientId: 'client-1', termId: null, amountMinor: 1, method: 'cash', paidAt: Date.now(), requestId: rid() }))).code).toBe('FORBIDDEN');
  });

  it('a term id that is not one of this relationship’s terms is refused', async () => {
    const { coach } = await world();
    expect(await reasonOf(pay(coach, 100, { termId: 'someone-elses-term' }))).toEqual({ code: 'NOT_FOUND', reason: 'TERM_NOT_FOUND' });
  });

  it('the coach lists their own records (newest first); no admin reads them, users.read or not (B38F-R2)', async () => {
    const { coach, admin } = await world();
    await pay(coach, 100, { paidAt: Date.now() - 2 * DAY });
    await pay(coach, 200, { paidAt: Date.now() - DAY });
    expect((await as(coach).clientPayments.list({})).map((p) => p.amountMinor)).toEqual([200, 100]);
    expect((await as(coach).clientPayments.list({ clientId: 'client-1' }))).toHaveLength(2);
    expect((await reasonOf(as(admin).clientPayments.list({ coachId: 'coach-1' }))).code).toBe('FORBIDDEN');
  });
});
