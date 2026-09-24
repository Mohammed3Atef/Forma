import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb, usersCol } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

let mongod: MongoMemoryReplSet;

// A one-member replica set (not a plain MongoMemoryServer standalone) —
// `coachPlanRequests.confirm` uses a real Mongo transaction, and transactions
// are only allowed on a replica set/mongos, never a standalone instance.
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
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
// Plain `admin` carries `users.manageStatus` (rbac.ts) but NOT the `super_admin`
// role itself — `coachPlans.adminUpdate`/`coachPlanTiers.save`/the change-request
// admin mutations are role-gated to `super_admin` specifically (tightened in the
// Admin Ops Hardening pass to match the frontend, which already restricts these
// screens to super_admin), so `admin` here is used to prove that gate holds.
const admin = authedUser({ _id: 'admin-1', role: 'admin' });
const superAdmin = authedUser({ _id: 'super-admin-1', role: 'super_admin' });

/** `trial` is the only code-seeded tier now — every other tier (e.g. 'pro'/'starter') must be created via `coachPlanTiers.save`, exactly like a real admin would from the dashboard. */
async function createCustomTier(key: string, maxClients: number, priceMonthly = 499) {
  const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
  await asSuperAdmin.coachPlanTiers.save({ key, label: key, maxClients, priceMonthly });
}

describe('coachPlans router', () => {
  it('createTrial is idempotent and me reads it back', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    const created = await asCoach.coachPlans.createTrial();
    expect(created.plan).toBe('trial');
    expect(created.maxClients).toBe(2);

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

  it('adminUpdate is super_admin-only (a plain admin is FORBIDDEN) and applies a tier change', async () => {
    await createCustomTier('pro', 100);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();

    await expect(asCoach.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(asAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const updated = await asSuperAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' });
    expect(updated.plan).toBe('pro');
    expect(updated.maxClients).toBe(100); // derived from the dashboard-created 'pro' tier config
    expect(updated.history?.at(-1)).toMatchObject({ action: 'tier', detail: 'pro' });
  });

  it('re-sending the SAME tier (the renew/extend-trial mechanism) bumps endsAt but never clobbers a custom maxClients override', async () => {
    await createCustomTier('pro', 100);
    await createCustomTier('starter', 25);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));

    // Move to 'pro' (100 clients by default), then give this coach a custom, non-default cap.
    await asSuperAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' });
    const overridden = await asSuperAdmin.coachPlans.adminUpdate({ coachId: coach.id, maxClients: 137 });
    expect(overridden.maxClients).toBe(137);
    const endsAtBefore = overridden.endsAt;

    // Renew/Extend Trial re-send the coach's CURRENT tier purely to push endsAt
    // forward — this must never reset maxClients back to the tier default.
    const renewed = await asSuperAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'pro' });
    expect(renewed.maxClients).toBe(137); // preserved, not reset to pro's default of 100
    expect(renewed.endsAt).toBeGreaterThan(endsAtBefore!);

    // A genuine tier CHANGE still recomputes the cap from the new tier's default.
    const changedTier = await asSuperAdmin.coachPlans.adminUpdate({ coachId: coach.id, tier: 'starter' });
    expect(changedTier.maxClients).toBe(25); // starter's dashboard-created default, not 137
  });
});

describe('coachPlanRequests router', () => {
  it('request lifecycle is super_admin-only for listPending/confirm/reject: submit, super admin sees it pending, confirm atomically activates the snapshot', async () => {
    await createCustomTier('starter', 25);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    await asCoach.coachPlanRequests.submit({ tierKey: 'starter', reason: 'Need more clients' });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(asAdmin.coachPlanRequests.listPending()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asAdmin.coachPlanRequests.confirm({ requestId: 'whatever' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const pending = await asSuperAdmin.coachPlanRequests.listPending();
    expect(pending.map((r) => r.coachId)).toEqual([coach.id]);
    expect(pending[0].status).toBe('awaiting');

    // The coach's real plan is untouched (still Trial) while the request is awaiting.
    const beforeConfirm = await asCoach.coachPlans.me();
    expect(beforeConfirm.plan).toBe('trial');

    const confirmed = await asSuperAdmin.coachPlanRequests.confirm({ requestId: pending[0].id });
    expect(confirmed.status).toBe('confirmed');

    // Applies the request's OWN immutable snapshot (built from 'starter' at submit time), not a re-read of the live tier.
    const plan = await asCoach.coachPlans.me();
    expect(plan.plan).toBe('starter');
    expect(plan.maxClients).toBe(25);
    expect(plan.status).toBe('active');

    // A resolved request can never be confirmed/rejected again (compare-and-swap).
    await expect(asSuperAdmin.coachPlanRequests.confirm({ requestId: pending[0].id })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(asSuperAdmin.coachPlanRequests.reject({ requestId: pending[0].id })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('confirming payment reactivates an account the trial-expiry grace period had pended, atomically with the plan activation', async () => {
    await createCustomTier('pro', 25);
    const activeCoach = authedUser({ _id: 'pending-coach-1', role: 'coach', accountStatus: 'active' });
    const users = await usersCol();
    await users.insertOne(activeCoach.doc);
    const asCoach = appRouter.createCaller(ctxFor(activeCoach));
    await asCoach.coachPlans.createTrial();
    const submitted = await asCoach.coachPlanRequests.submit({ tierKey: 'pro' });

    // Simulate the trial-expiry cron's grace-period pend (see api/cron/enforce-trial-expiry.ts).
    await users.updateOne({ _id: 'pending-coach-1' }, { $set: { accountStatus: 'pending' } });

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    await asSuperAdmin.coachPlanRequests.confirm({ requestId: submitted.id });

    const updatedUser = await users.findOne({ _id: 'pending-coach-1' });
    expect(updatedUser?.accountStatus).toBe('active');
  });

  it('reject never touches CoachPlanDoc — the coach keeps whatever plan they had', async () => {
    await createCustomTier('pro', 100);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    const submitted = await asCoach.coachPlanRequests.submit({ tierKey: 'pro' });

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const rejected = await asSuperAdmin.coachPlanRequests.reject({ requestId: submitted.id, adminNote: 'not now' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.adminNote).toBe('not now');

    const plan = await asCoach.coachPlans.me();
    expect(plan.plan).toBe('trial'); // completely unaffected by the rejection
  });

  it('a coach can cancel their own awaiting request but not once resolved', async () => {
    await createCustomTier('starter', 25);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    await asCoach.coachPlanRequests.submit({ tierKey: 'starter', reason: 'test' });

    const cancelled = await asCoach.coachPlanRequests.cancel();
    expect(cancelled.status).toBe('cancelled');
    await expect(asCoach.coachPlanRequests.cancel()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('submitting a new request auto-cancels a coach\'s prior awaiting request (no silent second live request)', async () => {
    await createCustomTier('starter', 25);
    await createCustomTier('pro', 100);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    const first = await asCoach.coachPlanRequests.submit({ tierKey: 'starter' });
    const second = await asCoach.coachPlanRequests.submit({ tierKey: 'pro' });
    expect(second.status).toBe('awaiting');

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const pending = await asSuperAdmin.coachPlanRequests.listPending();
    expect(pending.map((r) => r.id)).toEqual([second.id]); // the first was cancelled, not left dangling
    expect(pending.map((r) => r.id)).not.toContain(first.id);
  });

  it('the one-awaiting-request-per-coach guarantee is enforced at the database level — a concurrent submit racing past the app-level cancel cannot create two awaiting rows', async () => {
    await createCustomTier('starter', 25);
    await createCustomTier('pro', 100);
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await asCoach.coachPlans.createTrial();
    // Simulates two concurrent submits: `submit`'s own cancel-then-insert step
    // is not itself atomic, so the guarantee that matters is the partial
    // unique index rejecting a second concurrent insert outright.
    const results = await Promise.allSettled([
      asCoach.coachPlanRequests.submit({ tierKey: 'starter' }),
      asCoach.coachPlanRequests.submit({ tierKey: 'pro' }),
    ]);
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const pending = await asSuperAdmin.coachPlanRequests.listPending();
    // Whatever the outcome of the race, at most one row is ever left awaiting for this coach.
    expect(pending.filter((r) => r.coachId === coach.id).length).toBeLessThanOrEqual(1);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  });
});

describe('coachPlanTiers router', () => {
  it('list includes the built-in Trial seed tier even with none in Mongo — every other tier is created entirely from the dashboard', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    const tiers = await asCoach.coachPlanTiers.list({});
    expect(tiers.map((t) => t.key)).toEqual(['trial']);
  });

  it('list works for any signed-in user, active or not — matches the old REST tiers-index.ts (bare requireUser, no role/active check)', async () => {
    const suspendedCoach = authedUser({ _id: 'coach-3', role: 'coach', accountStatus: 'suspended' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(suspendedCoach));
    const tiers = await asSuspendedCoach.coachPlanTiers.list({});
    expect(tiers.length).toBeGreaterThan(0);
  });

  it('save is super_admin-only (a plain admin is FORBIDDEN), upserts a custom tier, and protects trial from archival', async () => {
    const asCoach = appRouter.createCaller(ctxFor(coach));
    await expect(asCoach.coachPlanTiers.save({ key: 'custom', maxClients: 50, priceMonthly: 20 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(asAdmin.coachPlanTiers.save({ key: 'custom', maxClients: 50, priceMonthly: 20 })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const saved = await asSuperAdmin.coachPlanTiers.save({ key: 'custom', label: 'Custom', maxClients: 50, priceMonthly: 20 });
    expect(saved.key).toBe('custom');
    expect(saved.builtIn).toBe(false);

    await expect(asSuperAdmin.coachPlanTiers.save({ key: 'trial', maxClients: 0, priceMonthly: 0, archived: true })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('editing a tier\'s maxClients propagates to every coach currently on it, but never to a coach with an explicit per-coach override', async () => {
    await createCustomTier('pro', 25);
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));

    // Two coaches on 'pro': one tier-derived, one with a manual admin override.
    const asCoachA = appRouter.createCaller(ctxFor(authedUser({ _id: 'coach-pro-a', role: 'coach' })));
    const asCoachB = appRouter.createCaller(ctxFor(authedUser({ _id: 'coach-pro-b', role: 'coach' })));
    await asCoachA.coachPlans.createTrial();
    await asCoachB.coachPlans.createTrial();
    await asSuperAdmin.coachPlans.adminUpdate({ coachId: 'coach-pro-a', tier: 'pro' });
    await asSuperAdmin.coachPlans.adminUpdate({ coachId: 'coach-pro-b', tier: 'pro' });
    // Give coach B an explicit override.
    await asSuperAdmin.coachPlans.adminUpdate({ coachId: 'coach-pro-b', maxClients: 999 });

    // Now the admin lowers the platform-wide 'pro' cap from 25 to 20.
    await asSuperAdmin.coachPlanTiers.save({ key: 'pro', label: 'pro', maxClients: 20, priceMonthly: 499 });

    const planA = await asCoachA.coachPlans.me();
    const planB = await asCoachB.coachPlans.me();
    expect(planA.maxClients).toBe(20); // swept along with the tier-wide change
    expect(planB.maxClients).toBe(999); // the manual override survives untouched
  });
});
