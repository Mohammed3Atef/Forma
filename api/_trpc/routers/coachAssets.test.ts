import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
}, 60_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  const db = await getDb();
  await db.dropDatabase();
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return {
    _id: 'user-1',
    email: 'a@example.com',
    emailLower: 'a@example.com',
    passwordHash: 'irrelevant-for-these-tests',
    displayName: 'Test User',
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

function authedUser(overrides: Partial<UserDoc>): AuthedUser {
  const doc = userDoc(overrides);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

const coachA = authedUser({ _id: 'coach-a', role: 'coach' });
const coachB = authedUser({ _id: 'coach-b', role: 'coach' });
const client = authedUser({ _id: 'client-1', role: 'client' });
// Plain admin has 'users.read' via ROLE_PERMISSIONS — oversight read, not write.
const admin = authedUser({ _id: 'admin-1', role: 'admin' });

const exerciseInput = {
  id: 'ex-1',
  name: 'Bench Press',
  targetMuscle: 'Chest',
  warmupSets: '1 set',
  workingSets: 3,
  repRange: '8-12',
  rir: '1-2',
  tempo: '2010',
  notes: { en: '', ar: '' },
  restSec: 90,
  videoId: null,
};

describe('coachAssets router — exercises (stripMeta resource: no coachId/createdAt/updatedAt in response)', () => {
  it('a coach can create, list, update, and delete their own exercise', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));

    const created = await asCoachA.coachAssets.exercises.save(exerciseInput);
    expect(created.id).toBe('ex-1');
    expect(created).not.toHaveProperty('coachId');
    expect(created).not.toHaveProperty('createdAt');

    expect(await asCoachA.coachAssets.exercises.list({})).toHaveLength(1);

    const updated = await asCoachA.coachAssets.exercises.update({ id: 'ex-1', name: 'Barbell Bench Press' });
    expect(updated.name).toBe('Barbell Bench Press');

    await asCoachA.coachAssets.exercises.delete({ id: 'ex-1' });
    expect(await asCoachA.coachAssets.exercises.list({})).toHaveLength(0);
  });

  it('save is an upsert: saving the same id twice replaces rather than duplicates', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);
    await asCoachA.coachAssets.exercises.save({ ...exerciseInput, name: 'Renamed' });
    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it("a coach cannot write to another coach's library, but can read it if they hold users.read", async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.exercises.save(exerciseInput);

    const asCoachB = appRouter.createCaller(ctxFor(coachB));
    // coachB has 'users.read' too (coach ROLE_PERMISSIONS includes it) — can read coachA's list...
    expect(await asCoachB.coachAssets.exercises.list({ coachId: coachA.id })).toHaveLength(1);
    // ...but cannot update/delete it (writes are always scoped to the caller's own id server-side).
    await expect(asCoachB.coachAssets.exercises.update({ id: 'ex-1', name: 'Hijacked' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(asCoachB.coachAssets.exercises.delete({ id: 'ex-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a client (no users.read) cannot list another user\'s library at all', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.exercises.list({ coachId: coachA.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a client cannot write (role-gated, not just ownership-gated)', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.exercises.save(exerciseInput)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('coachAssets router — billingPlans (keepMeta resource: response keeps coachId/createdAt/updatedAt)', () => {
  it('response keeps coachId/createdAt/updatedAt, and list sorts by order', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-b', name: 'B', unit: 'months', duration: 3, order: 2 });
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-a', name: 'A', unit: 'months', duration: 1, order: 1 });

    const list = await asCoachA.coachAssets.billingPlans.list({});
    expect(list.map((p) => p.id)).toEqual(['plan-a', 'plan-b']);
    expect(list[0]).toMatchObject({ coachId: coachA.id });
    expect(list[0].createdAt).toBeTypeOf('number');
  });

  it('an admin with users.read can read but the get-by-id 404 path also works', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    await asCoachA.coachAssets.billingPlans.save({ id: 'plan-a', name: 'A', unit: 'months', duration: 1 });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    const got = await asAdmin.coachAssets.billingPlans.get({ id: 'plan-a' });
    expect(got.name).toBe('A');

    await expect(asAdmin.coachAssets.billingPlans.get({ id: 'does-not-exist' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('coachAssets router — seedStarterLibrary', () => {
  it('is idempotent: seeding twice only inserts once', async () => {
    const asCoachA = appRouter.createCaller(ctxFor(coachA));
    const first = await asCoachA.coachAssets.seedStarterLibrary();
    expect(first.exercises.inserted).toBeGreaterThan(0);

    const second = await asCoachA.coachAssets.seedStarterLibrary();
    expect(second.exercises.inserted).toBe(0);
    expect(second.exercises.skipped).toBe(first.exercises.inserted);

    const list = await asCoachA.coachAssets.exercises.list({});
    expect(list.length).toBe(first.exercises.inserted);
  });

  it('is role-gated to coaches', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachAssets.seedStarterLibrary()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
