import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc, CoachPlanDoc } from '../../coach-clients/_types.js';

/**
 * B3.8 final review (owner, 2026-10-22) — Forma has two separate financial domains that must never
 * meet:
 *  - Forma ↔ coach: platform subscriptions, trials, renewals, capacity add-ons — Forma's revenue,
 *    managed by the Super Admin (`coachPlans`, `coachPlanRequests`, capacity entitlements);
 *  - coach ↔ client: the coach's own packages and the payments the coach records by hand
 *    (`coachClients` terms, `clientPayments`) — the coach's business, not Forma's revenue.
 * Pinned here: client payments never reach Forma platform revenue; Forma billing operations never
 * touch a client payment or term; payment operations never touch Forma billing; one coach never
 * reaches another coach's ledger; no admin reads a coach's ledger or package economics (owner,
 * B38F-R2); Forma revenue counts only payment-evidenced platform income (owner, B38F-R1).
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b38_finance';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
const FORMA_BILLING = ['coachPlans', 'coachPlanRequests', 'coachCapacityEntitlements', 'coachCapacityPackages', 'coachPlanTiers'];
const CLIENT_LEDGER = ['clientPayments', 'coachClients'];

function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const as = (u: AuthedUser) => appRouter.createCaller({ req: { headers: {} } as VercelRequest, res: { setHeader: () => undefined, appendHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return String((e as { code?: string }).code);
  }
};
async function snapshot(names: string[]) {
  const db = await getDb();
  const out: Record<string, unknown[]> = {};
  for (const name of names) out[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
  return out;
}
async function trialPlan(coachId: string) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: coachId, plan: 'trial', status: 'active', maxClients: 10, baseMaxClients: 10, addonClientCapacity: 0, manualCapacityAdjustment: 0, activeClientCount: 1, startedAt: now, endsAt: now + 10 * DAY, history: [], createdAt: now, updatedAt: now } as CoachPlanDoc);
}
async function relationship(coachId: string, clientId: string, termId: string, price: number) {
  const now = Date.now();
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({
    _id: `${coachId}__${clientId}`,
    coachId,
    clientId,
    status: 'active',
    createdBy: coachId,
    createdAt: now - 30 * DAY,
    updatedAt: now,
    subscription: { status: 'active', startAt: now - DAY, endAt: now + 29 * DAY, days: 30, months: 1, price, currency: 'EGP', termId, frozenFrom: null, frozenUntil: null, updatedAt: 1 },
  });
}
async function world() {
  const coach1 = await insertUser({ _id: 'coach-1' });
  const coach2 = await insertUser({ _id: 'coach-2' });
  await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
  await insertUser({ _id: 'client-2', role: 'client', assignedCoachId: 'coach-2' });
  const sup = await insertUser({ _id: 'super-1', role: 'super_admin' });
  const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
  await trialPlan('coach-1');
  await trialPlan('coach-2');
  await relationship('coach-1', 'client-1', 'term-1', 5_000);
  await relationship('coach-2', 'client-2', 'term-2', 3_000);
  return { coach1, coach2, sup, admin };
}
let n = 0;
const rid = () => `req-iso-${(n += 1)}-${Date.now()}`;
const pay = (u: AuthedUser, clientId: string, termId: string | null, amountMinor: number) =>
  as(u).clientPayments.record({ clientId, termId, amountMinor, method: 'instapay', paidAt: Date.now(), requestId: rid() });
/** Forma's own revenue, as the Super Admin's dashboards compute it. */
const formaRevenue = async (sup: AuthedUser) => {
  const d = await as(sup).adminCoaches.list();
  return { trackedRevenue: d.trackedRevenue, capacityRevenue: d.capacityRevenue };
};

describe('coach ↔ client money never reaches Forma platform revenue', () => {
  it('recording, correcting and reversing client payments — and pricing client packages — leave Forma revenue and billing untouched', async () => {
    const { coach1, coach2, sup } = await world();
    // coach-1 becomes a paying Forma customer: request → Super Admin confirms payment.
    const req = await as(coach1).coachPlanRequests.submitSubscription();
    await as(sup).coachPlanRequests.confirm({ requestId: req.id });
    const revenue = await formaRevenue(sup);
    expect(revenue.trackedRevenue).toBeGreaterThan(0);
    const billing = await snapshot(FORMA_BILLING);

    const p = await pay(coach1, 'client-1', 'term-1', 200_000);
    await pay(coach1, 'client-1', null, 50_000);
    await as(coach1).clientPayments.correct({ paymentId: p._id, reason: 'Amount typo', amountMinor: 250_000, method: 'cash', paidAt: Date.now(), termId: 'term-1', requestId: rid() });
    const q = await pay(coach2, 'client-2', 'term-2', 100_000);
    await as(coach2).clientPayments.reverse({ paymentId: q._id, reason: 'Wrong client', requestId: rid() });
    await as(coach1).coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'correct', price: 9_000 } });

    expect(await formaRevenue(sup)).toEqual(revenue);
    expect(await snapshot(FORMA_BILLING)).toEqual(billing);
  });
});

describe('Forma billing operations never touch a client payment or a client package', () => {
  it('suspend, reactivate, expire, extend, confirm and reject — the client ledger is byte-for-byte unchanged', async () => {
    const { coach1, coach2, sup } = await world();
    await pay(coach1, 'client-1', 'term-1', 100_000);
    await pay(coach1, 'client-1', null, 20_000);
    await pay(coach2, 'client-2', 'term-2', 30_000);
    const ledger = await snapshot(CLIENT_LEDGER);

    await as(sup).coachPlans.adminUpdate({ coachId: 'coach-1', status: 'suspended', reason: 'review' });
    await as(sup).coachPlans.adminUpdate({ coachId: 'coach-1', status: 'active' });
    await as(sup).coachPlans.adminUpdate({ coachId: 'coach-2', status: 'expired' });
    await as(sup).coachPlans.adminUpdate({ coachId: 'coach-2', endsAt: Date.now() + 40 * DAY });
    const r1 = await as(coach1).coachPlanRequests.submitSubscription();
    await as(sup).coachPlanRequests.confirm({ requestId: r1.id });
    const r2 = await as(coach2).coachPlanRequests.submitSubscription();
    await as(sup).coachPlanRequests.reject({ requestId: r2.id, adminNote: 'No transfer received' });

    expect(await snapshot(CLIENT_LEDGER)).toEqual(ledger);
  });
});

describe('one coach never reaches another coach’s client ledger', () => {
  it('no record, correction, reversal or read of another coach’s client payments — by id, by client or by coach', async () => {
    const { coach1, coach2 } = await world();
    const p = await pay(coach1, 'client-1', 'term-1', 100_000);
    const ledger = await snapshot(CLIENT_LEDGER);
    expect(await codeOf(pay(coach2, 'client-1', 'term-1', 1_000))).toBe('NOT_FOUND');
    expect(await codeOf(pay(coach2, 'client-2', 'term-1', 1_000))).toBe('NOT_FOUND'); // another relationship's term
    expect(await codeOf(as(coach2).clientPayments.correct({ paymentId: p._id, reason: 'x', amountMinor: 1, method: 'cash', paidAt: Date.now(), termId: null, requestId: rid() }))).toBe('NOT_FOUND');
    expect(await codeOf(as(coach2).clientPayments.reverse({ paymentId: p._id, reason: 'x', requestId: rid() }))).toBe('NOT_FOUND');
    expect(await codeOf(as(coach2).clientPayments.list({ coachId: 'coach-1' }))).toBe('FORBIDDEN');
    await expect(as(coach2).clientPayments.list({ clientId: 'client-1' })).resolves.toEqual([]);
    expect(await snapshot(CLIENT_LEDGER)).toEqual(ledger);
  });
});

/**
 * B3.8 final (owner, B38F-R2, 2026-10-22): a coach's client-payment records are private to that coach.
 * No role or permission (`users.read` included, also when granted as an extra permission) reads
 * another coach's ledger, and admin reads of relationships carry no package economics.
 */
describe('client payment records are private to their coach (B38F-R2)', () => {
  it('admins and super admins cannot read, record, correct or reverse a coach’s payments — direct API calls', async () => {
    const { coach1, sup, admin } = await world();
    const p = await pay(coach1, 'client-1', 'term-1', 100_000);
    for (const u of [sup, admin]) {
      expect(await codeOf(as(u).clientPayments.list({ coachId: 'coach-1' }))).toBe('FORBIDDEN');
      expect(await codeOf(as(u).clientPayments.list({}))).toBe('FORBIDDEN');
      expect(await codeOf(as(u).clientPayments.list({ clientId: 'client-1' }))).toBe('FORBIDDEN');
      expect(await codeOf(as(u).clientPayments.record({ clientId: 'client-1', termId: null, amountMinor: 1, method: 'cash', paidAt: Date.now(), requestId: rid() }))).toBe('FORBIDDEN');
      expect(await codeOf(as(u).clientPayments.reverse({ paymentId: p._id, reason: 'x', requestId: rid() }))).toBe('FORBIDDEN');
      expect(await codeOf(as(u).clientPayments.correct({ paymentId: p._id, reason: 'x', amountMinor: 1, method: 'cash', paidAt: Date.now(), termId: null, requestId: rid() }))).toBe('FORBIDDEN');
    }
    // The coach still reads their own (and only their own).
    await expect(as(coach1).clientPayments.list({})).resolves.toHaveLength(1);
    await expect(as(coach1).clientPayments.list({ coachId: 'coach-1' })).resolves.toHaveLength(1);
  });

  it('no permission grants it: a coach given users.read (or clients.readAll) still reads only their own ledger; a client reads none', async () => {
    const { coach1, coach2 } = await world();
    await pay(coach1, 'client-1', 'term-1', 500);
    const granted = { ...coach2, permissions: ['users.read' as const, 'clients.readAll' as const] };
    expect(await codeOf(as(granted).clientPayments.list({ coachId: 'coach-1' }))).toBe('FORBIDDEN');
    await expect(as(granted).clientPayments.list({ clientId: 'client-1' })).resolves.toEqual([]);
    const client = await insertUser({ _id: 'client-x', role: 'client' });
    expect(await codeOf(as(client).clientPayments.list({}))).toBe('FORBIDDEN');
  });

  it('admin reads of a relationship (get, by client, by coach) and of the member list carry no package economics; the coach and the client still see theirs', async () => {
    const { coach1, sup, admin } = await world();
    await as(coach1).coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'correct', price: 6_500, planName: 'Gold' } as never });
    const ECON = ['price', 'currency', 'planName', 'billingCycle', 'note'];
    const noEconomics = (sub: unknown) => ECON.every((k) => (sub as Record<string, unknown> | undefined)?.[k] === undefined);
    for (const u of [sup, admin]) {
      const one = await as(u).coachClients.get({ id: 'coach-1__client-1' });
      expect(noEconomics(one.subscription)).toBe(true);
      expect(one.subscription?.endAt).toBeTypeOf('number');
      expect((one.subscriptionEvents ?? []).length).toBeGreaterThan(0);
      for (const e of one.subscriptionEvents ?? []) expect(noEconomics(e.after) && noEconomics(e.before ?? undefined)).toBe(true);
      for (const r of await as(u).coachClients.list({ clientId: 'client-1' })) expect(noEconomics(r.subscription)).toBe(true);
      for (const r of await as(u).coachClients.list({ coachId: 'coach-1', status: 'all' })) expect(noEconomics(r.subscription)).toBe(true);
    }
    const members = (await as(admin).adminMembers.get({} as never)) as unknown as { rows: { user: { id: string }; subscription?: Record<string, unknown> }[] };
    const row = members.rows.find((r) => r.user.id === 'client-1');
    expect(row?.subscription?.endAt).toBeTypeOf('number');
    expect(noEconomics(row?.subscription)).toBe(true);
    // The relationship's own coach and its client still see the package.
    expect((await as(coach1).coachClients.get({ id: 'coach-1__client-1' })).subscription).toMatchObject({ price: 6_500, planName: 'Gold' });
    const users = (await getDb()).collection<UserDoc>('users');
    const clientDoc = (await users.findOne({ _id: 'client-1' }))!;
    const client = { id: 'client-1', role: 'client' as const, accountStatus: 'active' as const, permissions: [], doc: clientDoc };
    expect((await as(client).coachClients.get({ id: 'coach-1__client-1' })).subscription).toMatchObject({ price: 6_500 });
  });
});

/**
 * B3.8 final (owner, B38F-R1): Forma's revenue is its own — confirmed coach subscriptions and add-ons
 * bought through a confirmed request. Nothing from a coach's clients, nothing without payment evidence,
 * nothing one-time counted as monthly.
 */
describe('Forma platform revenue (B38F-R1)', () => {
  it('Admin growth carries no coach-client money at all', async () => {
    const { sup, coach1 } = await world();
    await pay(coach1, 'client-1', 'term-1', 400_000);
    const g = (await as(sup).adminGrowth.get()) as unknown as Record<string, unknown>;
    expect(g).not.toHaveProperty('clientMrr');
    expect(JSON.stringify(g)).not.toMatch(/"price"|"amountMinor"/);
  });

  it('only payment-evidenced recurring income counts: a paid plan without a confirmed payment, an admin-granted add-on and a one-time add-on are not monthly revenue', async () => {
    const { coach1, sup } = await world();
    const db = await getDb();
    const now = Date.now();
    // coach-1: a confirmed subscription (through the real request → confirm flow).
    const req = await as(coach1).coachPlanRequests.submitSubscription();
    await as(sup).coachPlanRequests.confirm({ requestId: req.id });
    const confirmed = ((await db.collection('coachPlans').findOne({ _id: 'coach-1' as never })) as unknown as { subscription: { priceMonthly: number } }).subscription.priceMonthly;
    // coach-2: a "paid" plan written by hand — no confirmed payment on record.
    await db.collection<CoachPlanDoc>('coachPlans').updateOne({ _id: 'coach-2' }, { $set: { plan: 'forma', subscription: { priceMonthly: 999, currency: 'EGP', billingInterval: 'month', termDays: 30, maxClients: 25, requestId: 'manual' } } as never });
    const snap = (price: number, billingInterval: 'month' | 'one_time') => ({ packageId: `p-${price}`, name: { en: 'X' }, additionalClients: 5, price, currency: 'EGP', billingInterval, durationMonths: billingInterval === 'month' ? 1 : null });
    await db.collection('coachCapacityEntitlements').insertMany([
      { _id: 'e-paid' as never, coachId: 'coach-1', sourcePackageId: 'p-150', source: 'request', snapshot: snap(150, 'month'), status: 'active', startsAt: now, endsAt: now + 30 * DAY, requestId: 'r1', confirmedBy: 'super-1', createdAt: now, updatedAt: now },
      { _id: 'e-once' as never, coachId: 'coach-1', sourcePackageId: 'p-700', source: 'request', snapshot: snap(700, 'one_time'), status: 'active', startsAt: now, endsAt: null, requestId: 'r2', confirmedBy: 'super-1', createdAt: now, updatedAt: now },
      { _id: 'e-granted' as never, coachId: 'coach-2', sourcePackageId: 'p-300', source: 'admin_package', snapshot: snap(300, 'month'), status: 'active', startsAt: now, endsAt: now + 30 * DAY, requestId: null, confirmedBy: 'super-1', createdAt: now, updatedAt: now },
    ]);
    const d = await as(sup).adminCoaches.list();
    expect(confirmed).toBeGreaterThan(0);
    expect(d.trackedRevenue).toBe(confirmed);
    expect(d.unconfirmedPaidCoaches).toBe(1);
    expect(d.capacityRevenue).toBe(150);
    expect(d.grantedAddons).toBe(1);
    // A coach's client packages and collections never move it.
    await as(coach1).coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'correct', price: 50_000 } });
    await pay(coach1, 'client-1', null, 900_000);
    const after = await as(sup).adminCoaches.list();
    expect({ t: after.trackedRevenue, c: after.capacityRevenue }).toEqual({ t: d.trackedRevenue, c: d.capacityRevenue });
  });
});
