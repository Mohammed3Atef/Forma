import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Collection } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../_trpc/router.js';
import type { AuthedUser, Context } from '../_trpc/context.js';
import { getDb } from '../_lib/mongodb.js';
import type { UserDoc } from '../_lib/types.js';
import type { CoachPlanDoc } from '../coach-plans/_data.js';
import type { CoachClientDoc } from './_types.js';
import type { SignupInviteDoc } from './_handlers/invites-types.js';
import { releaseClientSlot, reserveClientSlot } from './_data.js';
import { transferClientWithMode } from './_service.js';

/**
 * CON-1 from the backend audit: the client cap used to be a read followed by
 * a later `$inc`, so two simultaneous joins for a coach's LAST slot could both
 * pass. These tests issue genuinely concurrent calls (Promise.all over real
 * createCaller invocations against a real Mongo) and assert exactly one wins
 * on every join path — assign, invite claim, transfer — plus that a failure
 * after the reservation hands the slot back, and that a transfer that fails
 * mid-way rolls EVERYTHING back (it now runs in one transaction).
 */

/** String-keyed loose doc for the collections these tests only poke at incidentally. */
type AnyDoc = { _id: string } & Record<string, unknown>;

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
  const db = await getDb();
  await db.dropDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
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
    role: 'coach',
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

function authed(doc: UserDoc): AuthedUser {
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: { headers: {} } as unknown as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

async function givePlan(coachId: string, maxClients: number, activeClientCount = 0) {
  const doc: CoachPlanDoc = {
    _id: coachId,
    plan: 'trial',
    status: 'active',
    maxClients,
    activeClientCount,
    startedAt: Date.now(),
    endsAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne(doc);
}

async function planCount(coachId: string): Promise<number | undefined> {
  return (await (await getDb()).collection<CoachPlanDoc>('coachPlans').findOne({ _id: coachId }))?.activeClientCount;
}

async function activeRels(coachId: string): Promise<CoachClientDoc[]> {
  return (await getDb()).collection<CoachClientDoc>('coachClients').find({ coachId, status: 'active' }).toArray();
}

async function insertInvite(code: string, coachId: string): Promise<void> {
  const doc: SignupInviteDoc = {
    _id: code,
    coachId,
    status: 'pending',
    claimedByUid: null,
    createdAt: Date.now(),
    claimedAt: null,
    expiresAt: null,
    subStatus: 'trial',
  };
  await (await getDb()).collection<SignupInviteDoc>('signupInvites').insertOne(doc);
}

const settle = <T,>(ps: Promise<T>[]) => Promise.allSettled(ps);
const fulfilled = <T,>(rs: PromiseSettledResult<T>[]) => rs.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled');
const rejected = <T,>(rs: PromiseSettledResult<T>[]) => rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

describe('reserveClientSlot / releaseClientSlot', () => {
  it('a missing plan, a malformed cap or a missing counter is no_plan — never an open door', async () => {
    expect(await reserveClientSlot('nobody')).toBe('no_plan');
    const plans = (await getDb()).collection<CoachPlanDoc>('coachPlans');
    // Legacy doc with no counter: `$expr: {$lt: [null, 25]}` would be TRUE in
    // aggregation order — the filter must pin both fields to numbers.
    await plans.insertOne({ _id: 'legacy', plan: 'trial', status: 'active', maxClients: 25, startedAt: 0, endsAt: null, createdAt: 0, updatedAt: 0 });
    expect(await reserveClientSlot('legacy')).toBe('no_plan');
    expect(await planCount('legacy')).toBeUndefined();
    await plans.insertOne({ _id: 'zero', plan: 'trial', status: 'active', maxClients: 0, activeClientCount: 0, startedAt: 0, endsAt: null, createdAt: 0, updatedAt: 0 });
    expect(await reserveClientSlot('zero')).toBe('no_plan');
  });

  it('N concurrent reservations for one slot → exactly one ok, counter never exceeds maxClients', async () => {
    await givePlan('coach-1', 3, 2);
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveClientSlot('coach-1')));
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'at_cap')).toHaveLength(11);
    expect(await planCount('coach-1')).toBe(3);
  });

  it('release is floored at zero and ignores a doc with no numeric counter', async () => {
    await givePlan('coach-1', 3, 1);
    await releaseClientSlot('coach-1');
    await releaseClientSlot('coach-1');
    expect(await planCount('coach-1')).toBe(0);
    await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: 'legacy', plan: 'trial', status: 'active', maxClients: 25, startedAt: 0, endsAt: null, createdAt: 0, updatedAt: 0 });
    await releaseClientSlot('legacy');
    expect(await planCount('legacy')).toBeUndefined();
  });
});

describe('one remaining slot + simultaneous joins = exactly one succeeds', () => {
  it('coachClients.assign — two clients, one slot', async () => {
    const coach = await insertUser({ _id: 'coach-1' });
    await insertUser({ _id: 'client-a', role: 'client' });
    await insertUser({ _id: 'client-b', role: 'client' });
    await givePlan(coach._id, 1);
    const asCoach = appRouter.createCaller(ctxFor(authed(coach)));

    const rs = await settle([
      asCoach.coachClients.assign({ clientId: 'client-a', subscription: { status: 'trial', trialDays: 14 } }),
      asCoach.coachClients.assign({ clientId: 'client-b', subscription: { status: 'trial', trialDays: 14 } }),
    ]);
    expect(fulfilled(rs)).toHaveLength(1);
    expect(rejected(rs)).toHaveLength(1);
    expect(rejected(rs)[0].reason).toMatchObject({ code: 'CONFLICT', message: 'Client capacity reached — add client capacity to take on more clients' });
    expect(await activeRels(coach._id)).toHaveLength(1);
    expect(await planCount(coach._id)).toBe(1);

    // The loser's client is untouched and can be assigned elsewhere.
    const users = (await getDb()).collection<UserDoc>('users');
    const assigned = await users.countDocuments({ _id: { $in: ['client-a', 'client-b'] }, assignedCoachId: coach._id });
    expect(assigned).toBe(1);
  });

  it('invites.claim — two invites for the same coach, one slot', async () => {
    const coach = await insertUser({ _id: 'coach-1' });
    await givePlan(coach._id, 1);
    await insertInvite('AAAA2222', coach._id);
    await insertInvite('BBBB3333', coach._id);
    const anon = appRouter.createCaller(ctxFor(null));

    const rs = await settle([
      anon.invites.claim({ code: 'AAAA2222', email: 'x@example.com', phone: '1', password: 'password123' }),
      anon.invites.claim({ code: 'BBBB3333', email: 'y@example.com', phone: '2', password: 'password123' }),
    ]);
    expect(fulfilled(rs)).toHaveLength(1);
    expect(rejected(rs)[0].reason).toMatchObject({ code: 'CONFLICT', message: 'Client capacity reached — add client capacity to take on more clients' });

    const db = await getDb();
    expect(await db.collection<UserDoc>('users').countDocuments({ role: 'client' })).toBe(1);
    expect(await activeRels(coach._id)).toHaveLength(1);
    expect(await planCount(coach._id)).toBe(1);
    // The losing invite is rolled back to pending (still usable once a slot frees up).
    const invites = await db.collection<SignupInviteDoc>('signupInvites').find({}).toArray();
    expect(invites.map((i) => i.status).sort()).toEqual(['claimed', 'pending']);
  });

  it('transfer — two clients moved to the same destination coach with one slot', async () => {
    const superAdmin = await insertUser({ _id: 'sa', role: 'super_admin' });
    const from = await insertUser({ _id: 'coach-from' });
    const to = await insertUser({ _id: 'coach-to' });
    await insertUser({ _id: 'client-a', role: 'client', assignedCoachId: from._id });
    await insertUser({ _id: 'client-b', role: 'client', assignedCoachId: from._id });
    await givePlan(from._id, 10, 2);
    await givePlan(to._id, 1, 0);
    const rels = (await getDb()).collection<CoachClientDoc>('coachClients');
    for (const c of ['client-a', 'client-b']) {
      await rels.insertOne({ _id: `${from._id}__${c}`, coachId: from._id, clientId: c, status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });
    }
    const asAdmin = appRouter.createCaller(ctxFor(authed(superAdmin)));

    const rs = await settle([
      asAdmin.coachClients.transfer({ id: `${from._id}__client-a`, toCoachId: to._id, mode: 'keep_plans', subscriptionHandling: 'keep' }),
      asAdmin.coachClients.transfer({ id: `${from._id}__client-b`, toCoachId: to._id, mode: 'keep_plans', subscriptionHandling: 'keep' }),
    ]);
    expect(fulfilled(rs)).toHaveLength(1);
    expect(rejected(rs)[0].reason).toMatchObject({ code: 'CONFLICT' });
    expect(await activeRels(to._id)).toHaveLength(1);
    expect(await activeRels(from._id)).toHaveLength(1);
    expect(await planCount(to._id)).toBe(1);
    expect(await planCount(from._id)).toBe(1);
  });
});

describe('failure after the reservation', () => {
  it('assign: a failed relationship write releases the slot and the next assign succeeds', async () => {
    const coach = await insertUser({ _id: 'coach-1' });
    await insertUser({ _id: 'client-a', role: 'client' });
    await givePlan(coach._id, 1);
    const asCoach = appRouter.createCaller(ctxFor(authed(coach)));

    // First `updateOne` after the reservation is the relationship upsert.
    const original = Collection.prototype.updateOne;
    let armed = true;
    vi.spyOn(Collection.prototype, 'updateOne').mockImplementation(function (this: Collection, ...args: Parameters<typeof original>) {
      if (armed && this.collectionName === 'coachClients') {
        armed = false;
        return Promise.reject(new Error('simulated write failure'));
      }
      return original.apply(this, args);
    } as typeof original);

    await expect(asCoach.coachClients.assign({ clientId: 'client-a', subscription: { status: 'trial', trialDays: 14 } })).rejects.toThrow('simulated write failure');
    expect(await planCount(coach._id)).toBe(0);
    expect(await activeRels(coach._id)).toHaveLength(0);

    const rel = await asCoach.coachClients.assign({ clientId: 'client-a', subscription: { status: 'trial', trialDays: 14 } });
    expect(rel.status).toBe('active');
    expect(await planCount(coach._id)).toBe(1);
  });

  it('transfer: a failure mid-way rolls back the relationship, the archive, the counters and the client', async () => {
    const from = await insertUser({ _id: 'coach-from' });
    const to = await insertUser({ _id: 'coach-to' });
    await insertUser({ _id: 'client-a', role: 'client', assignedCoachId: from._id });
    await givePlan(from._id, 10, 1);
    await givePlan(to._id, 5, 0);
    const db = await getDb();
    await db.collection<CoachClientDoc>('coachClients').insertOne({ _id: `${from._id}__client-a`, coachId: from._id, clientId: 'client-a', status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });
    await db.collection<AnyDoc>('clientWorkoutPlans').insertOne({ _id: 'client-a', clientId: 'client-a', coachId: from._id, days: [], updatedAt: 1 });
    await db.collection<AnyDoc>('coachNotes').insertOne({ _id: 'note-1', clientId: 'client-a', coachId: from._id, body: 'hi', createdAt: 1, updatedAt: 1 });

    // Fail the LAST write (the client's assignedCoachId) so every earlier
    // write inside the transaction has already happened when it aborts.
    const original = Collection.prototype.updateOne;
    vi.spyOn(Collection.prototype, 'updateOne').mockImplementation(function (this: Collection, ...args: Parameters<typeof original>) {
      if (this.collectionName === 'users') return Promise.reject(new Error('simulated users write failure'));
      return original.apply(this, args);
    } as typeof original);

    await expect(transferClientWithMode('client-a', from._id, to._id, 'fresh_start', 'keep', 'sa')).rejects.toThrow('simulated users write failure');
    vi.restoreAllMocks();

    const fromRel = await db.collection<CoachClientDoc>('coachClients').findOne({ _id: `${from._id}__client-a` });
    expect(fromRel?.status).toBe('active');
    expect(await db.collection<AnyDoc>('coachClients').findOne({ _id: `${to._id}__client-a` })).toBeNull();
    expect(await db.collection<AnyDoc>('archivedClientData').countDocuments({})).toBe(0);
    expect(await db.collection<AnyDoc>('clientWorkoutPlans').findOne({ _id: 'client-a' })).toBeTruthy();
    expect(await db.collection<AnyDoc>('coachNotes').countDocuments({ clientId: 'client-a' })).toBe(1);
    expect(await planCount(from._id)).toBe(1);
    expect(await planCount(to._id)).toBe(0);
    expect((await db.collection<UserDoc>('users').findOne({ _id: 'client-a' }))?.assignedCoachId).toBe(from._id);

    // And with the fault gone the very same transfer completes fully.
    const rel = await transferClientWithMode('client-a', from._id, to._id, 'fresh_start', 'keep', 'sa');
    expect(rel.coachId).toBe(to._id);
    expect(await db.collection<AnyDoc>('archivedClientData').countDocuments({})).toBe(2);
    expect(await db.collection<AnyDoc>('clientWorkoutPlans').findOne({ _id: 'client-a' })).toBeNull();
    expect(await planCount(from._id)).toBe(0);
    expect(await planCount(to._id)).toBe(1);
    expect((await db.collection<UserDoc>('users').findOne({ _id: 'client-a' }))?.assignedCoachId).toBe(to._id);
  });

  it('transfer to a full destination changes nothing at all', async () => {
    const from = await insertUser({ _id: 'coach-from' });
    const to = await insertUser({ _id: 'coach-to' });
    await insertUser({ _id: 'client-a', role: 'client', assignedCoachId: from._id });
    await givePlan(from._id, 10, 1);
    await givePlan(to._id, 1, 1);
    const db = await getDb();
    await db.collection<CoachClientDoc>('coachClients').insertOne({ _id: `${from._id}__client-a`, coachId: from._id, clientId: 'client-a', status: 'active', createdBy: 'x', createdAt: 1, updatedAt: 1 });

    await expect(transferClientWithMode('client-a', from._id, to._id, 'keep_plans', 'keep', 'sa')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Destination coach: client capacity reached — add client capacity to take on more clients',
    });
    expect((await db.collection<CoachClientDoc>('coachClients').findOne({ _id: `${from._id}__client-a` }))?.status).toBe('active');
    expect(await planCount(from._id)).toBe(1);
    expect(await planCount(to._id)).toBe(1);
  });
});
