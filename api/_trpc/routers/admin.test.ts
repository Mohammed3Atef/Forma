import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientRelDoc } from '../../client/_lib/db.js';
import type { CoachPlanDoc } from '../../admin/_lib/types.js';

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

async function assignCoach(coachId: string, clientId: string): Promise<void> {
  const db = await getDb();
  const rel: CoachClientRelDoc = { _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active' };
  await db.collection<CoachClientRelDoc>('coachClients').insertOne(rel);
}

async function givePlan(coachId: string): Promise<void> {
  const db = await getDb();
  const doc: CoachPlanDoc = {
    _id: coachId,
    plan: 'trial',
    status: 'active',
    maxClients: 10,
    startedAt: Date.now(),
    endsAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.collection<CoachPlanDoc>('coachPlans').insertOne(doc);
}

describe('admin module — stats/members/growth', () => {
  it('are readable by a plain admin (users.read) but rejected for a client', async () => {
    const adminDoc = await insertUser({ _id: 'admin-1', role: 'admin' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await insertUser({ _id: 'coach-1', role: 'coach' });
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(adminDoc)));
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));

    const stats = await asAdmin.adminStats.get();
    expect(stats.total).toBe(3);
    expect(stats.byRole.coach).toBe(1);

    await expect(asClient.adminStats.get()).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const members = await asAdmin.adminMembers.get();
    expect(members.total).toBe(3);

    const growth = await asAdmin.adminGrowth.get();
    expect(growth.totalMembers).toBe(3);
  });
});

describe('admin module — coaches', () => {
  it('is super_admin-only (a plain admin is FORBIDDEN); lists coaches with real client counts, reads one coach detail, and search narrows rows without moving the KPI totals', async () => {
    const adminDoc = await insertUser({ _id: 'admin-1', role: 'admin' });
    const superAdminDoc = await insertUser({ _id: 'super-admin-1', role: 'super_admin' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach', displayName: 'Ahmed Coach' });
    const otherCoachDoc = await insertUser({ _id: 'coach-2', role: 'coach', displayName: 'Sara Coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await assignCoach(coachDoc._id, clientDoc._id);
    await givePlan(coachDoc._id);
    await givePlan(otherCoachDoc._id);
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(adminDoc)));
    const asSuperAdmin = appRouter.createCaller(ctxFor(authedUser(superAdminDoc)));

    // A plain admin — even though they hold `users.read` — cannot reach this
    // full per-coach admin rollup; the frontend already restricts the whole
    // AdminCoaches page to super_admin, and the backend now matches.
    await expect(asAdmin.adminCoaches.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asAdmin.adminCoaches.detail({ id: coachDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const list = await asSuperAdmin.adminCoaches.list();
    expect(list.totalCoaches).toBe(2);
    expect(list.rows.find((r) => r.coach.id === coachDoc._id)?.clientCount).toBe(1);
    // Regression guard: coachPlans docs are keyed by `_id` (== coachId) and never carry a
    // separate `coachId` field — a prior bug (predating the tRPC migration) built this lookup
    // by `p.coachId` instead of `p._id`, so `plan`/`state`/`maxClients` always came back
    // null/"none"/undefined in production despite the underlying plan doc being correct.
    const row = list.rows.find((r) => r.coach.id === coachDoc._id);
    expect(row?.plan?.plan).toBe('trial');
    expect(row?.plan?.maxClients).toBe(10);
    expect(row?.state).toBe('trial');

    // `search` narrows the returned `rows` server-side over the whole
    // collection, but the KPI totals stay based on the unfiltered set.
    const searched = await asSuperAdmin.adminCoaches.list({ search: 'ahmed' });
    expect(searched.rows.map((r) => r.coach.id)).toEqual([coachDoc._id]);
    expect(searched.totalCoaches).toBe(2); // unaffected by the search term

    const detail = await asSuperAdmin.adminCoaches.detail({ id: coachDoc._id });
    expect(detail.clients).toHaveLength(1);
    expect(detail.clients[0].id).toBe(clientDoc._id);

    await expect(asSuperAdmin.adminCoaches.detail({ id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('admin module — audit', () => {
  it('lets an admin create+list freely; restricts a coach to the allow-listed self-logged action for their own client', async () => {
    const adminDoc = await insertUser({ _id: 'admin-1', role: 'admin' });
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const otherCoach = await insertUser({ _id: 'coach-2', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    await assignCoach(coachDoc._id, clientDoc._id);
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(adminDoc)));
    const asCoach = appRouter.createCaller(ctxFor(authedUser(coachDoc)));
    const asOtherCoach = appRouter.createCaller(ctxFor(authedUser(otherCoach)));

    await asAdmin.adminAudit.create({ action: 'user.create', targetUserId: clientDoc._id });
    await asCoach.adminAudit.create({ action: 'client.measurement', targetUserId: clientDoc._id });

    await expect(asCoach.adminAudit.create({ action: 'user.delete', targetUserId: clientDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asOtherCoach.adminAudit.create({ action: 'client.measurement', targetUserId: clientDoc._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const list = await asAdmin.adminAudit.list();
    expect(list.logs).toHaveLength(2);

    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));
    await expect(asClient.adminAudit.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('list filters server-side by actorId, targetUserId, an exact action, and a bare category prefix', async () => {
    const adminDoc = await insertUser({ _id: 'admin-1', role: 'admin' });
    const otherAdmin = await insertUser({ _id: 'admin-2', role: 'admin' });
    const clientA = await insertUser({ _id: 'client-a', role: 'client' });
    const clientB = await insertUser({ _id: 'client-b', role: 'client' });
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(adminDoc)));
    const asOtherAdmin = appRouter.createCaller(ctxFor(authedUser(otherAdmin)));

    await asAdmin.adminAudit.create({ action: 'users.setStatus', targetUserId: clientA._id });
    await asAdmin.adminAudit.create({ action: 'users.setRole', targetUserId: clientB._id });
    await asOtherAdmin.adminAudit.create({ action: 'coachPlan.setTier', targetUserId: clientA._id });

    // Exact actor.
    const byActor = await asAdmin.adminAudit.list({ actorId: otherAdmin._id });
    expect(byActor.logs.map((l) => l.action)).toEqual(['coachPlan.setTier']);

    // Exact target.
    const byTarget = await asAdmin.adminAudit.list({ targetUserId: clientB._id });
    expect(byTarget.logs.map((l) => l.action)).toEqual(['users.setRole']);

    // Exact action key (contains a '.').
    const byExactAction = await asAdmin.adminAudit.list({ action: 'users.setRole' });
    expect(byExactAction.logs).toHaveLength(1);

    // Bare category prefix (no '.') matches every action under that category,
    // but not an unrelated category that happens to share a prefix string.
    const byCategory = await asAdmin.adminAudit.list({ action: 'users' });
    expect(byCategory.logs.map((l) => l.action).sort()).toEqual(['users.setRole', 'users.setStatus']);
    const byOtherCategory = await asAdmin.adminAudit.list({ action: 'coachPlan' });
    expect(byOtherCategory.logs.map((l) => l.action)).toEqual(['coachPlan.setTier']);
  });
});

describe('admin module — users', () => {
  it('supports the full account-management cycle with escalation protection', async () => {
    const superAdmin = await insertUser({ _id: 'super-1', role: 'super_admin' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const asSuper = appRouter.createCaller(ctxFor(authedUser(superAdmin)));
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(admin)));

    const created = await asAdmin.adminUsers.create({ email: 'new@example.com', password: 'password123', displayName: 'New Client', role: 'client' });
    expect(created.role).toBe('client');

    // a plain admin cannot provision another admin account
    await expect(
      asAdmin.adminUsers.create({ email: 'admin2@example.com', password: 'password123', displayName: 'Admin Two', role: 'admin' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const bySuper = await asSuper.adminUsers.create({ email: 'admin2@example.com', password: 'password123', displayName: 'Admin Two', role: 'admin' });
    expect(bySuper.role).toBe('admin');

    // a plain admin cannot modify another admin account
    await expect(asAdmin.adminUsers.setStatus({ id: bySuper.id, status: 'suspended' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const suspended = await asSuper.adminUsers.setStatus({ id: bySuper.id, status: 'suspended' });
    expect(suspended.accountStatus).toBe('suspended');

    // self-mutation is always blocked
    await expect(asAdmin.adminUsers.setStatus({ id: admin._id, status: 'suspended' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asAdmin.adminUsers.setRole({ id: admin._id, role: 'client' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const roleChanged = await asAdmin.adminUsers.setRole({ id: created.id, role: 'coach' });
    expect(roleChanged.role).toBe('coach');

    const permed = await asAdmin.adminUsers.setPermissions({ id: created.id, permissions: ['clients.readAll'] });
    expect(permed.permissions).toEqual(['clients.readAll']);

    const bulk = await asAdmin.adminUsers.bulkSetStatus({ targetIds: [created.id, 'nonexistent'], status: 'disabled' });
    expect(bulk.ok).toBe(1);
    expect(bulk.failed).toBe(1);

    const listed = await asAdmin.adminUsers.list({});
    expect(listed.users.length).toBeGreaterThanOrEqual(3);

    // delete is super_admin only
    await expect(asAdmin.adminUsers.delete({ id: created.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await asSuper.adminUsers.delete({ id: created.id });
    await expect(asAdmin.adminUsers.get({ id: created.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('list.search matches name/email/phone case-insensitively across the WHOLE collection, not just one page, and composes with role/status', async () => {
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    const asAdmin = appRouter.createCaller(ctxFor(authedUser(admin)));

    // Enough unrelated accounts to span more than one default page (25), so a
    // match on the LAST inserted (oldest by createdAt, since list sorts desc)
    // account proves the search isn't limited to an already-loaded page.
    for (let i = 0; i < 30; i++) {
      await insertUser({ _id: `filler-${i}`, email: `filler${i}@example.com`, role: 'client', createdAt: Date.now() - (30 - i) * 1000 });
    }
    await insertUser({ _id: 'needle-1', email: 'needle@example.com', displayName: 'Needle Haystack', role: 'client', accountStatus: 'suspended', createdAt: Date.now() - 100_000 });

    const bySearch = await asAdmin.adminUsers.list({ search: 'needle' });
    expect(bySearch.users.map((u) => u.id)).toEqual(['needle-1']);

    // Case-insensitive, and matches on displayName too (not just email).
    const byName = await asAdmin.adminUsers.list({ search: 'HAYSTACK' });
    expect(byName.users.map((u) => u.id)).toEqual(['needle-1']);

    // Composes with role/status filters (AND, not OR).
    const wrongStatus = await asAdmin.adminUsers.list({ search: 'needle', status: 'active' });
    expect(wrongStatus.users).toHaveLength(0);
    const rightStatus = await asAdmin.adminUsers.list({ search: 'needle', status: 'suspended', role: 'client' });
    expect(rightStatus.users.map((u) => u.id)).toEqual(['needle-1']);

    // A search string with regex metacharacters doesn't throw or match everything.
    await expect(asAdmin.adminUsers.list({ search: 'a+b(c' })).resolves.toMatchObject({ users: [] });
  });

  it('users.get is readable by ANY active signed-in user (not gated by users.read) — fixes the client "Your Coach" card', async () => {
    const coachDoc = await insertUser({ _id: 'coach-1', role: 'coach' });
    const clientDoc = await insertUser({ _id: 'client-1', role: 'client' });
    const asClient = appRouter.createCaller(ctxFor(authedUser(clientDoc)));

    const coachPublic = await asClient.adminUsers.get({ id: coachDoc._id });
    expect(coachPublic.id).toBe(coachDoc._id);
    expect(coachPublic).not.toHaveProperty('passwordHash');
  });

  it('rejects an unauthenticated caller everywhere', async () => {
    const anon = appRouter.createCaller(ctxFor(null));
    await expect(anon.adminUsers.get({ id: 'whoever' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.adminStats.get()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
