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

const coach = authedUser({ _id: 'coach-1', role: 'coach' });
const client = authedUser({ _id: 'client-1', role: 'client' });
// super_admin carries users.manageStatus via ROLE_PERMISSIONS (plain admin also does — see rbac.ts).
const admin = authedUser({ _id: 'admin-1', role: 'admin' });

describe('coachPlans router', () => {
  it('createTrial is idempotent and me reads it back', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    const created = await asCoach.coachPlans.createTrial();
    expect(created.plan).toBe('trial');
    expect(created.maxClients).toBe(10);

    const again = await asCoach.coachPlans.createTrial();
    expect(again.createdAt).toBe(created.createdAt); // untouched, not re-created

    const me = await asCoach.coachPlans.me();
    expect(me.coachId).toBe('coach-1');
  });

  it('me is role-gated to coaches', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await expect(asClient.coachPlans.me()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('me and createTrial work for a suspended coach — matches the old REST me.ts/trial.ts, which had no active check', async () => {
    const suspendedCoach = authedUser({ _id: 'coach-2', role: 'coach', accountStatus: 'suspended' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(suspendedCoach));
    const created = await asSuspendedCoach.coachPlans.createTrial();
    expect(created.plan).toBe('trial');
    const me = await asSuspendedCoach.coachPlans.me();
    expect(me.coachId).toBe('coach-2');
  });

  it('me 404s before a trial/plan exists', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await expect(asCoach.coachPlans.me()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('adminUpdate requires users.manageStatus and applies a tier change', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();

    await expect(asCoach.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    const updated = await asAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' });
    expect(updated.plan).toBe('pro');
    expect(updated.maxClients).toBe(100); // derived from the built-in pro tier config
    expect(updated.history?.at(-1)).toMatchObject({ action: 'tier', detail: 'pro' });
  });

  it('change-request lifecycle: submit, admin sees it pending, accept applies the tier', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    await asCoach.coachPlans.submitChangeRequest({ requestedTier: 'starter', reason: 'Need more clients' });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    const pending = await asAdmin.coachPlans.listPendingChangeRequests();
    expect(pending.map((r) => r.coachId)).toEqual([coach.id]);

    const resolved = await asAdmin.coachPlans.resolveChangeRequest({ coachId: coach.id, decision: 'accepted', adminNote: 'ok' });
    expect(resolved.status).toBe('accepted');

    const plan = await asCoach.coachPlans.me();
    expect(plan.plan).toBe('starter');
    expect(plan.maxClients).toBe(25);
  });

  it('a coach can cancel their own pending request but not once resolved', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    await asCoach.coachPlans.submitChangeRequest({ reason: 'test' });

    const cancelled = await asCoach.coachPlans.cancelChangeRequest();
    expect(cancelled.status).toBe('cancelled');
    await expect(asCoach.coachPlans.cancelChangeRequest()).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('coachPlanTiers router', () => {
  it('list includes built-in seed tiers even with none in Mongo', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    const tiers = await asCoach.coachPlanTiers.list({});
    expect(tiers.map((t) => t.key)).toEqual(['trial', 'starter', 'pro', 'enterprise']);
  });

  it('list works for any signed-in user, active or not — matches the old REST tiers-index.ts (bare requireUser, no role/active check)', async () => {
    const suspendedCoach = authedUser({ _id: 'coach-3', role: 'coach', accountStatus: 'suspended' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(suspendedCoach));
    const tiers = await asSuspendedCoach.coachPlanTiers.list({});
    expect(tiers.length).toBeGreaterThan(0);
  });

  it('save requires users.manageStatus, upserts a custom tier, and protects trial from archival', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await expect(asCoach.coachPlanTiers.save({ key: 'custom', maxClients: 50, priceMonthly: 20 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    const saved = await asAdmin.coachPlanTiers.save({ key: 'custom', label: 'Custom', maxClients: 50, priceMonthly: 20 });
    expect(saved.key).toBe('custom');
    expect(saved.builtIn).toBe(false);

    await expect(asAdmin.coachPlanTiers.save({ key: 'trial', maxClients: 0, priceMonthly: 0, archived: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
