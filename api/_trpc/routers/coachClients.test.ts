import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod'; // invites.claim signs a real session
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

async function insertUser(overrides: Partial<UserDoc>): Promise<UserDoc> {
  const doc = userDoc(overrides);
  const db = await getDb();
  await db.collection<UserDoc>('users').insertOne(doc);
  return doc;
}

function authedUser(doc: UserDoc): AuthedUser {
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

async function givePlan(coachId: string, maxClients = 10) {
  const db = await getDb();
  const doc: CoachPlanDoc = {
    _id: coachId,
    plan: 'trial',
    status: 'active',
    maxClients,
    activeClientCount: 0,
    startedAt: Date.now(),
    endsAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.collection<CoachPlanDoc>('coachPlans').insertOne(doc);
}

describe('coachClients router', () => {
  it('assign requires an unassigned client and enforces the coach client cap', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachDoc._id, 1);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    const rel = await asCoach.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });
    expect(rel.status).toBe('active');

    const client2 = await insertUser({ _id: 'client-2', role: 'client' });
    await expect(
      asCoach.coachClients.assign({ clientId: client2._id, subscription: { status: 'trial', trialDays: 14 } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' }); // at cap (max 1)
  });

  it('list scopes to the caller unless they hold users.read', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    // Another coach CAN read this list — every 'coach' carries users.read per rbac.ts
    // (oversight-style read access), unlike a plain 'client', which cannot.
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    const unrelatedClient = await insertUser({ _id: 'client-2', role: 'client' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachDoc._id);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    await asCoach.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));
    expect(await asOtherCoach.coachClients.list({ coachId: coachDoc._id })).toHaveLength(1);

    const asUnrelatedClient = appRouter.createCaller(ctxFor(authedUser(unrelatedClient)));
    await expect(asUnrelatedClient.coachClients.list({ coachId: coachDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // "my own" list, no filter
    expect(await asCoach.coachClients.list({})).toHaveLength(1);
  });

  it('list/get work for a suspended coach, but assign still requires an active account — matches the old REST index.ts/detail.ts (bare requireUser on GET, requireActive right before any mutation)', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach', accountStatus: 'suspended' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));

    expect(await asSuspendedCoach.coachClients.list({})).toHaveLength(0);
    await expect(
      asSuspendedCoach.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('end releases the client and frees a cap slot', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachDoc._id, 1);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    await asCoach.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    await asCoach.coachClients.end({ id: `${coachDoc._id}__${clientDoc._id}`, reason: 'released' });
    const rel = await asCoach.coachClients.get({ id: `${coachDoc._id}__${clientDoc._id}` });
    expect(rel.status).toBe('ended');
    expect(rel.endReason).toBe('released');

    // cap slot freed — a second client can now be assigned
    const client2 = await insertUser({ _id: 'client-2', role: 'client' });
    await expect(asCoach.coachClients.assign({ clientId: client2._id, subscription: { status: 'trial', trialDays: 14 } })).resolves.toBeTruthy();
  });

  it('updateSubscription is gated to the owning coach or clients.writeAll', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachDoc._id);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    await asCoach.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));
    await expect(
      asOtherCoach.coachClients.updateSubscription({ id: `${coachDoc._id}__${clientDoc._id}`, sub: { op: 'extend', days: 5 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const updated = await asCoach.coachClients.updateSubscription({ id: `${coachDoc._id}__${clientDoc._id}`, sub: { op: 'extend', days: 5 } });
    expect(updated.subscription?.endAt).toBeGreaterThan(Date.now());
  });

  it('transfer is admin-only, and fresh_start additionally requires clients.writeAll', async () => {
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachA._id);
    await givePlan(coachB._id);
    const asCoachA = appRouter.createCaller(ctxFor(authedUser(coachA)));
    await asCoachA.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    // plain coach cannot transfer directly
    await expect(
      asCoachA.coachClients.transfer({ id: `${coachA._id}__${clientDoc._id}`, toCoachId: coachB._id, mode: 'keep_plans', subscriptionHandling: 'keep' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // admin (coaches.assign only, no clients.writeAll) cannot do fresh_start
    const admin = authedUser(await insertUser({ _id: 'admin-1', role: 'admin' }));
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(
      asAdmin.coachClients.transfer({ id: `${coachA._id}__${clientDoc._id}`, toCoachId: coachB._id, mode: 'fresh_start', subscriptionHandling: 'keep' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // super_admin (has clients.writeAll) can
    const superAdmin = authedUser(await insertUser({ _id: 'super-1', role: 'super_admin' }));
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    const rel = await asSuperAdmin.coachClients.transfer({
      id: `${coachA._id}__${clientDoc._id}`,
      toCoachId: coachB._id,
      mode: 'keep_plans',
      subscriptionHandling: 'keep',
    });
    expect(rel.coachId).toBe(coachB._id);
  });
});

describe('invites router', () => {
  it('a coach creates an invite and it can be claimed publicly (no auth), assigning the client', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach', displayName: 'Coach One' });
    await givePlan(coachDoc._id);
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const invite = await asCoach.invites.create({ email: 'newclient@example.com', subStatus: 'trial', subTrialDays: 14 });
    expect(invite.status).toBe('pending');

    const publicCaller = appRouter.createCaller(ctxFor(null));
    const looked = await publicCaller.invites.getByCode({ code: invite._id });
    expect(looked.claimable).toBe(true);

    const claimed = await publicCaller.invites.claim({
      code: invite._id,
      phone: '5551234',
      password: 'password123',
      displayName: 'New Client',
    });
    expect(claimed.user.role).toBe('client');
    expect(claimed.accessToken).toBeTruthy();
    expect(claimed.relationship.coachId).toBe(coachDoc._id);

    // single-use: claiming again fails
    await expect(
      publicCaller.invites.claim({ code: invite._id, phone: '555', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('list works for a suspended coach (no active-status requirement) — matches the old REST invites-index.ts', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach', accountStatus: 'suspended' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    await expect(asSuspendedCoach.invites.list({})).resolves.toEqual([]);
  });

  it('only the owning coach or an admin with coaches.assign may revoke', async () => {
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const asCoachA = appRouter.createCaller(ctxFor(authedUser(coachA)));
    const invite = await asCoachA.invites.create({});

    const asCoachB = appRouter.createCaller(ctxFor(authedUser(coachB)));
    await expect(asCoachB.invites.revoke({ code: invite._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const revoked = await asCoachA.invites.revoke({ code: invite._id });
    expect(revoked.status).toBe('revoked');
  });
});

describe('transfers router', () => {
  it('list works for a suspended coach (no active-status requirement) — matches the old REST transfers-index.ts', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach', accountStatus: 'suspended' });
    const asSuspendedCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    await expect(asSuspendedCoach.transfers.list({ type: 'incoming' })).resolves.toEqual([]);
  });

  it('a prospective coach requests a client, the current coach accepts, and the client is reassigned', async () => {
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachA._id);
    await givePlan(coachB._id);
    const asCoachA = appRouter.createCaller(ctxFor(authedUser(coachA)));
    await asCoachA.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    const asCoachB = appRouter.createCaller(ctxFor(authedUser(coachB)));
    await asCoachB.transfers.create({ clientId: clientDoc._id, fromCoachId: coachA._id, reason: 'Better fit', mode: 'keep_plans', subscriptionHandling: 'keep' });

    const incoming = await asCoachA.transfers.list({ type: 'incoming' });
    expect(incoming).toHaveLength(1);

    const resolved = await asCoachA.transfers.resolve({ id: `${coachB._id}__${clientDoc._id}`, action: 'accept' });
    expect(resolved.status).toBe('accepted');

    const rel = await asCoachB.coachClients.get({ id: `${coachB._id}__${clientDoc._id}` });
    expect(rel.status).toBe('active');
    expect(rel.coachId).toBe(coachB._id);
  });

  it('only the requesting coach may cancel their own request', async () => {
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coachA._id);
    const asCoachA = appRouter.createCaller(ctxFor(authedUser(coachA)));
    await asCoachA.coachClients.assign({ clientId: clientDoc._id, subscription: { status: 'trial', trialDays: 14 } });

    const asCoachB = appRouter.createCaller(ctxFor(authedUser(coachB)));
    await asCoachB.transfers.create({ clientId: clientDoc._id, fromCoachId: coachA._id, reason: 'test' });

    await expect(asCoachA.transfers.resolve({ id: `${coachB._id}__${clientDoc._id}`, action: 'cancel' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const cancelled = await asCoachB.transfers.resolve({ id: `${coachB._id}__${clientDoc._id}`, action: 'cancel' });
    expect(cancelled.status).toBe('cancelled');
  });
});
