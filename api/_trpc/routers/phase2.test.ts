import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc, CoachPlanRequestDoc } from '../../coach-plans/_data.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';

/**
 * Server-side changes made during the Phase-2 frontend interaction audit —
 * each one backs a UI control that was dead or wired to the wrong outcome.
 * Replica set: transfers run in a transaction.
 */

let mongod: MongoMemoryReplSet;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 90_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  const id = overrides._id ?? 'user-1';
  return {
    _id: id,
    email: `${id}@example.com`,
    emailLower: `${id}@example.com`,
    passwordHash: 'irrelevant',
    displayName: id,
    role: 'client',
    accountStatus: 'active',
    permissions: [],
    featureFlags: {},
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function insertUser(overrides: Partial<UserDoc>): Promise<UserDoc> {
  const doc = userDoc(overrides);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return doc;
}

function caller(u: UserDoc) {
  const user: AuthedUser = { id: u._id, role: u.role, accountStatus: u.accountStatus, permissions: u.permissions, doc: u };
  const ctx: Context = { req: { headers: {} } as unknown as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
  return appRouter.createCaller(ctx);
}

async function givePlan(coachId: string, plan: string, maxClients: number, activeClientCount = 0) {
  const doc: CoachPlanDoc = { _id: coachId, plan, status: 'active', maxClients, activeClientCount, startedAt: Date.now(), endsAt: null, createdAt: Date.now(), updatedAt: Date.now() };
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne(doc);
}

describe('auth.updateProfile — photo removal (AvatarPicker "Remove")', () => {
  it('photoUrl: null removes the photo; omitted leaves it; a string sets it', async () => {
    const u = await insertUser({ _id: 'c1', photoUrl: 'https://cdn/x.webp' });
    const me = caller(u);
    expect((await me.auth.updateProfile({ displayName: 'Renamed' })).photoUrl).toBe('https://cdn/x.webp');
    const cleared = await me.auth.updateProfile({ photoUrl: null });
    expect(cleared.photoUrl).toBeUndefined();
    const stored = await (await getDb()).collection<UserDoc>('users').findOne({ _id: 'c1' });
    expect(stored && 'photoUrl' in stored).toBe(false);
    expect((await me.auth.updateProfile({ photoUrl: 'https://cdn/y.webp' })).photoUrl).toBe('https://cdn/y.webp');
  });
});

describe('coachPlanRequests.submit — renewal is possible, trial/archived are not', () => {
  beforeEach(async () => {
    const tiers = (await getDb()).collection('coachPlanTiers');
    await tiers.insertMany([
      { _id: 'pro', label: 'Pro', maxClients: 25, priceMonthly: 499, currency: 'EGP', active: true, createdAt: 0, updatedAt: 0 } as never,
      { _id: 'old', label: 'Old', maxClients: 10, priceMonthly: 99, currency: 'EGP', active: true, archived: true, createdAt: 0, updatedAt: 0 } as never,
    ]);
  });

  it('a Pro coach re-requesting Pro records a `renewal`; a trial coach requesting Pro is a `trial_upgrade`', async () => {
    const pro = await insertUser({ _id: 'coach-pro', role: 'coach' });
    await givePlan(pro._id, 'pro', 25);
    const r = await caller(pro).coachPlanRequests.submit({ tierKey: 'pro' });
    expect(r.type).toBe('renewal');
    expect(r.status).toBe('awaiting');

    const trial = await insertUser({ _id: 'coach-trial', role: 'coach' });
    await givePlan(trial._id, 'trial', 2);
    expect((await caller(trial).coachPlanRequests.submit({ tierKey: 'pro' })).type).toBe('trial_upgrade');
  });

  it('the Trial and archived tiers cannot be requested', async () => {
    const c = await insertUser({ _id: 'coach-1', role: 'coach' });
    await givePlan(c._id, 'trial', 2);
    await expect(caller(c).coachPlanRequests.submit({ tierKey: 'trial' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(c).coachPlanRequests.submit({ tierKey: 'old' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await (await getDb()).collection<CoachPlanRequestDoc>('coachPlanRequests').countDocuments({})).toBe(0);
  });
});

describe('transfers.resolve accept — admin review closes the request with the reviewed settings', () => {
  it('applies override mode/subscription, moves the client, and marks the request accepted', async () => {
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const from = await insertUser({ _id: 'coach-from', role: 'coach' });
    const to = await insertUser({ _id: 'coach-to', role: 'coach' });
    await insertUser({ _id: 'client-a', assignedCoachId: from._id });
    await givePlan(from._id, 'pro', 25, 1);
    await givePlan(to._id, 'pro', 25, 0);
    const db = await getDb();
    await db.collection<CoachClientDoc>('coachClients').insertOne({ _id: `${from._id}__client-a`, coachId: from._id, clientId: 'client-a', status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });
    await caller(to).transfers.create({ clientId: 'client-a', fromCoachId: from._id, reason: 'moving gyms' });

    await caller(admin).transfers.resolve({
      id: `${to._id}__client-a`,
      action: 'accept',
      subscriptionHandling: 'new',
      newSubscription: { status: 'active', months: 3, price: 900 },
    });

    const req = await db.collection('transferRequests').findOne({ _id: `${to._id}__client-a` } as never);
    expect(req?.status).toBe('accepted');
    const newRel = await db.collection<CoachClientDoc>('coachClients').findOne({ _id: `${to._id}__client-a` });
    expect(newRel?.status).toBe('active');
    expect(newRel?.subscription?.status).toBe('active');
    expect(newRel?.subscription?.price).toBe(900);
    expect(newRel?.subscription?.months).toBe(3);
    expect((await db.collection<CoachClientDoc>('coachClients').findOne({ _id: `${from._id}__client-a` }))?.status).toBe('ended');
  });

  it('a plain admin cannot override into fresh_start (clients.writeAll only)', async () => {
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const from = await insertUser({ _id: 'coach-from', role: 'coach' });
    const to = await insertUser({ _id: 'coach-to', role: 'coach' });
    await insertUser({ _id: 'client-a', assignedCoachId: from._id });
    await givePlan(from._id, 'pro', 25, 1);
    await givePlan(to._id, 'pro', 25, 0);
    await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: `${from._id}__client-a`, coachId: from._id, clientId: 'client-a', status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });
    await caller(to).transfers.create({ clientId: 'client-a', fromCoachId: from._id, reason: 'r' });
    await expect(caller(admin).transfers.resolve({ id: `${to._id}__client-a`, action: 'accept', mode: 'fresh_start' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('the current coach approving an incoming request moves the client exactly once (no follow-up release needed)', async () => {
    const from = await insertUser({ _id: 'coach-from', role: 'coach' });
    const to = await insertUser({ _id: 'coach-to', role: 'coach' });
    await insertUser({ _id: 'client-a', assignedCoachId: from._id });
    await givePlan(from._id, 'pro', 25, 1);
    await givePlan(to._id, 'pro', 25, 0);
    const db = await getDb();
    await db.collection<CoachClientDoc>('coachClients').insertOne({ _id: `${from._id}__client-a`, coachId: from._id, clientId: 'client-a', status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });
    await caller(to).transfers.create({ clientId: 'client-a', fromCoachId: from._id, reason: 'r' });
    await caller(from).transfers.resolve({ id: `${to._id}__client-a`, action: 'accept' });
    // What IncomingTransferRequests used to do next — proves it could only ever fail.
    await expect(caller(from).coachClients.end({ id: `${from._id}__client-a` })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await db.collection<UserDoc>('users').findOne({ _id: 'client-a' }))?.assignedCoachId).toBe(to._id);
  });
});

describe('measurements.save — an emptied field is really removed', () => {
  it('clear removes the key; untouched keys survive the merge', async () => {
    const c = await insertUser({ _id: 'client-1' });
    const me = caller(c);
    await me.measurements.save({ date: '2026-09-20', values: { waist: 80, chest: 100 } });
    await me.measurements.save({ date: '2026-09-20', values: { hips: 95 } });
    expect((await me.measurements.list({})).find((l) => l.date === '2026-09-20')?.values).toEqual({ waist: 80, chest: 100, hips: 95 });
    await me.measurements.save({ date: '2026-09-20', values: {}, clear: ['waist'] });
    expect((await me.measurements.list({})).find((l) => l.date === '2026-09-20')?.values).toEqual({ chest: 100, hips: 95 });
  });
});

describe('banners — CTA link must be http(s)', () => {
  it('refuses javascript:/data: links, accepts https', async () => {
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const base = { title: 'T', style: 'info' as const, placement: 'all' as const, roles: [], segment: 'all' as const, active: true, ctaLabel: 'Go' };
    await expect(caller(admin).banners.create({ ...base, ctaHref: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(admin).banners.create({ ...base, ctaHref: 'data:text/html,x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller(admin).banners.create({ ...base, ctaHref: 'https://example.com/offer' })).resolves.toBeTruthy();
  });
});
