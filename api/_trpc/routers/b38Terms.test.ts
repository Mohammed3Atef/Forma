import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import { addDays, dateKeyIn, startOfDay, todayIn } from '../../_lib/civilDate.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc, CoachPlanDoc, SubscriptionDoc } from '../../coach-clients/_types.js';

/**
 * B3.8 (owner decisions 2, 3 and 8, 2026-10-21): fixed-day client terms and Fix C through the
 * API. Every scenario of the Phase 0 audit (B38-R2), plus back-dating, retries, concurrent
 * changes, the year boundary and the EGP-only rule. The suite is also run with TZ=UTC: nothing
 * here may depend on the server's time zone.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b38_terms';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
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
const cairo = (d: string) => startOfDay(d, CAIRO);

function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const as = (u: AuthedUser | null) => appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
const rel = async () => (await (await getDb()).collection<CoachClientDoc>('coachClients').findOne({ _id: REL }))!;
async function givePlan(coachId: string) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').updateOne({ _id: coachId }, { $set: { plan: 'forma', status: 'active', maxClients: 10, activeClientCount: 0, endsAt: now + 30 * DAY, createdAt: now, updatedAt: now } }, { upsert: true });
}

/** A 30-day term in Cairo starting `startDate`, as B3.8 writes it. */
function dated(startDate: string, over: Partial<SubscriptionDoc> = {}): SubscriptionDoc {
  const endDate = addDays(startDate, 30);
  return { status: 'active', startDate, endDate, days: 30, months: 1, zone: CAIRO, startAt: cairo(startDate), endAt: cairo(endDate), price: 1000, currency: 'EGP', termId: 'term-1', frozenFrom: null, frozenUntil: null, updatedAt: 1, ...over };
}
async function world(sub: SubscriptionDoc | null) {
  const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
  await givePlan('coach-1'); // B38F-R3: a real coach always has a plan
  const client = await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
  const superAdmin = await insertUser({ _id: 'sa-1', role: 'super_admin' });
  const now = Date.now();
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: REL, coachId: 'coach-1', clientId: 'client-1', status: 'active', createdBy: 'coach-1', createdAt: now - 90 * DAY, updatedAt: now, ...(sub ? { subscription: sub } : {}) });
  return { coach, client, superAdmin };
}
const update = (u: AuthedUser, sub: Record<string, unknown>, extra: Record<string, unknown> = {}) => as(u).coachClients.updateSubscription({ id: REL, sub, ...extra } as never);

describe('B38-R2 — the Phase 0 scenarios now book exactly one term per sale', () => {
  it('1. Renew on a running term books a NEW term starting the day after it ends (not a copy of the current one)', async () => {
    const start = addDays(today(), -25); // ends in 5 days
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'renew', months: 1, price: 1000 });
    expect(doc.subscription).toMatchObject({ startDate: addDays(start, 30), endDate: addDays(start, 60), days: 30, price: 1000, currency: 'EGP', status: 'active' });
    expect(doc.subscription!.termId).not.toBe('term-1');
    expect(doc.subscriptionHistory).toEqual([expect.objectContaining({ termId: 'term-1', startDate: start, endDate: addDays(start, 30), endAt: cairo(addDays(start, 30)), archivedBy: 'renew', price: 1000 })]);
  });

  it('2. Renewing with a longer package and a new price: 90 days after the current term, at the new price', async () => {
    const start = addDays(today(), -25);
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'renew', months: 3, price: 2500 });
    expect(doc.subscription).toMatchObject({ startDate: addDays(start, 30), endDate: addDays(start, 120), days: 90, months: 3, price: 2500 });
    expect(doc.subscriptionHistory).toHaveLength(1);
  });

  it('3. Correcting a start date edits the same term (same id, no history entry, the old version audited)', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'correct', startDate: addDays(start, 2) });
    expect(doc.subscription).toMatchObject({ termId: 'term-1', startDate: addDays(start, 2), endDate: addDays(start, 32), days: 30, price: 1000 });
    expect(doc.subscriptionHistory ?? []).toHaveLength(0);
    expect(doc.subscriptionEvents?.at(-1)).toMatchObject({ op: 'correct', reason: 'correction', before: { startDate: start, price: 1000, termId: 'term-1' }, after: { startDate: addDays(start, 2) } });
  });

  it('4. A true renewal after a lapse starts today and archives the lapsed term as expired', async () => {
    const start = addDays(today(), -38); // ended 8 days ago
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'renew', months: 1, price: 1000 });
    expect(doc.subscription).toMatchObject({ startDate: today(), endDate: addDays(today(), 30) });
    expect(doc.subscriptionHistory?.[0]).toMatchObject({ status: 'expired', archivedBy: 'renew', endDate: addDays(start, 30) });
  });

  it('5. Renewing a running term that started last month really renews it (the end moves; nothing is re-booked in the old month)', async () => {
    const start = addDays(today(), -29); // last day is today
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'renew', months: 1, price: 1000 });
    expect(doc.subscription!.startDate).toBe(today() === addDays(start, 29) ? addDays(today(), 1) : addDays(start, 30));
    expect(doc.subscription!.endAt).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it('a save that changes nothing writes nothing — no event, no term, same version', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start, { planName: 'Monthly' }));
    const before = await rel();
    await update(coach, { op: 'correct', startDate: start, months: 1, price: 1000, planName: 'Monthly' });
    const after = await rel();
    expect(after.subscription!.updatedAt).toBe(before.subscription!.updatedAt);
    expect(after.subscriptionEvents ?? []).toHaveLength(0);
    expect(after.subscriptionHistory ?? []).toHaveLength(0);
  });

  it('a package change mid-term (Fix C financial treatment) is a correction of the same economic term: one term, the new price', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'correct', reason: 'changePackage', months: 3, price: 2400, planName: 'Quarterly' });
    expect(doc.subscription).toMatchObject({ termId: 'term-1', startDate: start, days: 90, endDate: addDays(start, 90), price: 2400, planName: 'Quarterly' });
    expect(doc.subscriptionHistory ?? []).toHaveLength(0);
    expect(doc.subscriptionEvents?.at(-1)).toMatchObject({ op: 'correct', reason: 'changePackage', before: { price: 1000, days: 30 }, after: { price: 2400, days: 90 } });
  });
});

describe('Fix C — intent is explicit and checked', () => {
  it('a running term cannot be "renewed" from another day', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start));
    expect(await reasonOf(update(coach, { op: 'renew', startDate: start, months: 1 }))).toEqual({ code: 'CONFLICT', reason: 'RENEWAL_STARTS_AFTER_TERM' });
    expect(await reasonOf(update(coach, { op: 'renew', startDate: today(), months: 1 }))).toEqual({ code: 'CONFLICT', reason: 'RENEWAL_STARTS_AFTER_TERM' });
    expect((await rel()).subscriptionHistory ?? []).toHaveLength(0);
  });

  it('newTerm only for a client without a term; renew / correct need one', async () => {
    const { coach } = await world(dated(addDays(today(), -10)));
    expect(await reasonOf(update(coach, { op: 'newTerm', months: 1 }))).toEqual({ code: 'CONFLICT', reason: 'TERM_EXISTS' });
    await (await getDb()).collection<CoachClientDoc>('coachClients').updateOne({ _id: REL }, { $set: { subscription: { status: 'pending', startAt: 1, endAt: 1, updatedAt: 1 } } });
    expect(await reasonOf(update(coach, { op: 'renew', months: 1 }))).toEqual({ code: 'CONFLICT', reason: 'NO_TERM' });
    expect(await reasonOf(update(coach, { op: 'correct', price: 5 }))).toEqual({ code: 'CONFLICT', reason: 'NO_TERM' });
    const doc = await update(coach, { op: 'newTerm', startDate: today(), months: 1, price: 900 });
    expect(doc.subscription).toMatchObject({ status: 'active', startDate: today(), days: 30, price: 900, currency: 'EGP' });
    const trial = await world2Trial();
    expect(trial).toMatchObject({ status: 'trial', days: 7, endDate: addDays(today(), 7) });
  });

  it('the pre-B3.8 setTerm / setPrice are refused with APP_UPDATE_REQUIRED and write nothing', async () => {
    const { coach } = await world(dated(addDays(today(), -10)));
    expect(await reasonOf(update(coach, { op: 'setTerm', startAt: Date.now(), months: 1 }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'APP_UPDATE_REQUIRED' });
    expect(await reasonOf(update(coach, { op: 'setPrice', price: 1 }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'APP_UPDATE_REQUIRED' });
    expect((await rel()).subscriptionEvents ?? []).toHaveLength(0);
  });

  it('a correction against a term that was renewed meanwhile is refused (expectedTermId)', async () => {
    const { coach } = await world(dated(addDays(today(), -10)));
    expect(await reasonOf(update(coach, { op: 'correct', price: 1 }, { expectedTermId: 'term-older' }))).toEqual({ code: 'CONFLICT', reason: 'SUBSCRIPTION_CHANGED' });
    await expect(update(coach, { op: 'correct', price: 1100 }, { expectedTermId: 'term-1' })).resolves.toBeTruthy();
  });

  it('a running term with an unfinished pause is renewed after the pause', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start));
    await update(coach, { op: 'freeze', from: cairo(addDays(today(), 2)), until: cairo(addDays(today(), 5)) });
    expect((await rel()).subscription).toMatchObject({ status: 'frozen', endDate: addDays(start, 33) });
    expect(await reasonOf(update(coach, { op: 'renew', months: 1 }))).toEqual({ code: 'CONFLICT', reason: 'RENEWAL_DURING_FREEZE' });
    await update(coach, { op: 'unfreeze' });
    const doc = await update(coach, { op: 'renew', months: 1 });
    expect(doc.subscription!.startDate).toBe(addDays(start, 30));
  });
});

async function world2Trial() {
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: 'coach-1__client-2', coachId: 'coach-1', clientId: 'client-2', status: 'active', createdBy: 'coach-1', createdAt: Date.now(), updatedAt: Date.now() });
  const coach: AuthedUser = { id: 'coach-1', role: 'coach', accountStatus: 'active', permissions: [], doc: userDoc({ _id: 'coach-1' }) };
  const doc = await as(coach).coachClients.updateSubscription({ id: 'coach-1__client-2', sub: { op: 'newTerm', status: 'trial', days: 7, startDate: today() } });
  return doc.subscription;
}

describe('retries and concurrency', () => {
  it('a renewal retried with the same request id is applied once (one new term, one event)', async () => {
    const { coach } = await world(dated(addDays(today(), -25)));
    const a = await update(coach, { op: 'renew', months: 1, price: 1000 }, { requestId: 'req-renew-0001' });
    const b = await update(coach, { op: 'renew', months: 1, price: 1000 }, { requestId: 'req-renew-0001' });
    expect(b.subscription!.termId).toBe(a.subscription!.termId);
    const r = await rel();
    expect(r.subscriptionHistory).toHaveLength(1);
    expect(r.subscriptionEvents?.filter((e) => e.op === 'renew')).toHaveLength(1);
  });

  it('three racing copies of one renewal produce one term; two different racing changes never both apply', async () => {
    const { coach } = await world(dated(addDays(today(), -25)));
    const same = await Promise.allSettled([1, 2, 3].map(() => update(coach, { op: 'renew', months: 1 }, { requestId: 'req-race-00001' })));
    expect(same.every((r) => r.status === 'fulfilled')).toBe(true);
    expect((await rel()).subscriptionHistory).toHaveLength(1);
    const different = await Promise.allSettled([update(coach, { op: 'renew', months: 1 }, { requestId: 'req-race-00002' }), update(coach, { op: 'renew', months: 1 }, { requestId: 'req-race-00003' })]);
    const won = different.filter((r) => r.status === 'fulfilled').length;
    expect((await rel()).subscriptionHistory).toHaveLength(1 + won);
    for (const r of different) if (r.status === 'rejected') expect((r.reason as { cause?: { reason?: string } }).cause?.reason).toBe('SUBSCRIPTION_CHANGED');
  });
});

describe('calendar days — back-dating, year boundary, extensions', () => {
  it('a renewal back-dated over unpaid days is flagged; a correction that moves a start earlier is flagged too', async () => {
    const { coach } = await world(dated(addDays(today(), -40)));
    await update(coach, { op: 'renew', startDate: addDays(today(), -8), months: 1 });
    expect((await rel()).subscriptionEvents?.at(-1)).toMatchObject({ op: 'renew', backdated: true });
    await update(coach, { op: 'correct', startDate: addDays(today(), -12) });
    expect((await rel()).subscriptionEvents?.at(-1)).toMatchObject({ op: 'correct', backdated: true });
    await update(coach, { op: 'correct', price: 1234 });
    expect((await rel()).subscriptionEvents?.at(-1)).not.toHaveProperty('backdated');
  });

  it('across the year end: 15 Dec + 30 days → 14 Jan; the renewal starts 14 Jan', async () => {
    const { coach } = await world(null);
    const doc = await update(coach, { op: 'newTerm', startDate: '2026-12-15', months: 1, zone: CAIRO });
    expect(doc.subscription).toMatchObject({ startDate: '2026-12-15', endDate: '2027-01-14', startAt: cairo('2026-12-15'), endAt: cairo('2027-01-14') });
  });

  it('extend adds calendar days from the end (running) or from today (lapsed), ending on a midnight in the term zone', async () => {
    const start = addDays(today(), -10);
    const { coach } = await world(dated(start));
    const doc = await update(coach, { op: 'extend', days: 7 });
    expect(doc.subscription).toMatchObject({ endDate: addDays(start, 37), endAt: cairo(addDays(start, 37)), days: 30 });
  });

  it('a term written before B3.8 (instants only) keeps working: a price correction leaves its dates alone and gives it an id', async () => {
    const legacy: SubscriptionDoc = { status: 'active', startAt: Date.now() - 5 * DAY, endAt: Date.now() + 25 * DAY, months: 1, price: 800, frozenFrom: null, frozenUntil: null, updatedAt: 1 };
    const { coach } = await world(legacy);
    const doc = await update(coach, { op: 'correct', price: 850 });
    expect(doc.subscription).toMatchObject({ startAt: legacy.startAt, endAt: legacy.endAt, price: 850 });
    expect(doc.subscription!.termId).toBeTruthy();
    expect(doc.subscription!.startDate).toBeUndefined();
  });
});

describe('EGP-only (owner decision 8)', () => {
  it('an explicit non-EGP currency is refused, never relabelled; EGP in any case is accepted', async () => {
    const { coach } = await world(dated(addDays(today(), -40)));
    expect(await reasonOf(update(coach, { op: 'renew', months: 1, price: 50, currency: 'USD' }))).toEqual({ code: 'BAD_REQUEST', reason: 'UNSUPPORTED_CURRENCY' });
    expect(await reasonOf(update(coach, { op: 'correct', price: 50, currency: 'SAR' }))).toEqual({ code: 'BAD_REQUEST', reason: 'UNSUPPORTED_CURRENCY' });
    expect((await rel()).subscriptionEvents ?? []).toHaveLength(0);
    const doc = await update(coach, { op: 'renew', months: 1, price: 50, currency: 'egp' });
    expect(doc.subscription).toMatchObject({ price: 50, currency: 'EGP' });
  });

  it('assign, invite and transfer refuse a non-EGP currency; a priced invite is stored in EGP', async () => {
    const coach = await insertUser({ _id: 'coach-9', role: 'coach' });
    await givePlan('coach-9');
    await insertUser({ _id: 'client-9', role: 'client' });
    expect(await reasonOf(as(coach).coachClients.assign({ clientId: 'client-9', subscription: { status: 'active', months: 1, price: 10, currency: 'USD' } }))).toEqual({ code: 'BAD_REQUEST', reason: 'UNSUPPORTED_CURRENCY' });
    expect(await reasonOf(as(coach).invites.create({ subStatus: 'active', subPrice: 10, subCurrency: 'USD' }))).toEqual({ code: 'BAD_REQUEST', reason: 'UNSUPPORTED_CURRENCY' });
    const invite = await as(coach).invites.create({ subStatus: 'active', subPrice: 10, subMonths: 1, subZone: CAIRO });
    expect(invite).toMatchObject({ subCurrency: 'EGP', subZone: CAIRO });
  });

  it('a price with more than two decimals is refused', async () => {
    const { coach } = await world(dated(addDays(today(), -40)));
    expect((await reasonOf(update(coach, { op: 'renew', months: 1, price: 10.005 }))).code).toBe('BAD_REQUEST');
  });
});

describe('every way a term is created uses the same calendar rules', () => {
  it('assign with a start date and months: 30-day months, EGP, a term id', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    await givePlan('coach-1');
    await insertUser({ _id: 'client-1', role: 'client' });
    const doc = await as(coach).coachClients.assign({ clientId: 'client-1', subscription: { status: 'active', months: 2, price: 1500, startDate: '2027-02-01', zone: CAIRO } });
    expect(doc.subscription).toMatchObject({ startDate: '2027-02-01', endDate: '2027-04-02', days: 60, months: 2, currency: 'EGP' });
    expect(doc.subscription!.termId).toBeTruthy();
  });

  it('an invite claim starts the term on the claim day in the invite zone', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    await givePlan('coach-1');
    const invite = await as(coach).invites.create({ email: 'claim@example.com', subStatus: 'active', subMonths: 1, subPrice: 900, subZone: CAIRO });
    const claimed = await as(null).invites.claim({ code: invite._id, phone: '5551234', password: 'password123', displayName: 'New Client' });
    expect(claimed.relationship.subscription).toMatchObject({ startDate: dateKeyIn(Date.now(), CAIRO), days: 30, price: 900, currency: 'EGP', zone: CAIRO });
  });

  it('a "keep" transfer hands the term over without the old coach’s price or term id', async () => {
    const { superAdmin } = await world(dated(addDays(today(), -10), { planName: 'Gold' }));
    await insertUser({ _id: 'coach-2', role: 'coach' });
    await givePlan('coach-2');
    await (await getDb()).collection<UserDoc>('users').updateOne({ _id: 'sa-1' }, { $set: { permissions: [] } });
    const moved = await as(superAdmin).coachClients.transfer({ id: REL, toCoachId: 'coach-2', mode: 'keep_plans', subscriptionHandling: 'keep' });
    expect(moved.subscription).toMatchObject({ startDate: addDays(today(), -10), endDate: addDays(today(), 20) });
    expect(moved.subscription!.price).toBeUndefined();
    expect(moved.subscription!.planName).toBeUndefined();
    expect(moved.subscription!.termId).toBeTruthy();
    expect(moved.subscription!.termId).not.toBe('term-1');
  });
});
