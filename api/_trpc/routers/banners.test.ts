import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/**
 * Real Mongo round-trips via `mongodb-memory-server` (no mocks) — proves the
 * plumbing (context → middleware → `_lib.ts` accessors) end to end, per the
 * tRPC migration plan's testing strategy. `getDb()` (`api/_lib/mongodb.ts`)
 * only reads `MONGODB_URI`/`MONGODB_DB` lazily on first call, so setting
 * them in `beforeAll` — before any test invokes a procedure — is enough;
 * no need to delay the static imports above.
 */
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
  return {
    req: {} as VercelRequest,
    res: { setHeader: () => undefined } as unknown as VercelResponse,
    user,
  };
}

const coach = authedUser({ _id: 'coach-1', role: 'coach' });
// `admin` already carries `flags.manage`/`users.read` via ROLE_PERMISSIONS (api/_lib/rbac.ts) — no extra grants needed.
const admin = authedUser({ _id: 'admin-1', role: 'admin' });

const baseFields = { style: 'info' as const, placement: 'all' as const, roles: [], segment: 'all' as const, active: true };

describe('banners router', () => {
  it('list starts empty', async () => {
    const caller = appRouter.createCaller(ctxFor(coach));
    expect(await caller.banners.list()).toEqual([]);
  });

  it('rejects create from a user without flags.manage', async () => {
    const caller = appRouter.createCaller(ctxFor(coach));
    await expect(caller.banners.create({ title: 'Nope', ...baseFields })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects every procedure from a signed-out (null) user', async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.banners.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('admin can create, list, update, and delete a banner', async () => {
    const asAdmin = appRouter.createCaller(ctxFor(admin));

    const created = await asAdmin.banners.create({ title: 'Promo', ...baseFields });
    expect(created.title).toBe('Promo');
    expect(created.createdBy).toBe('admin-1');

    expect(await asAdmin.banners.list()).toHaveLength(1);

    const updated = await asAdmin.banners.update({ id: created.id, title: 'Promo v2', ...baseFields });
    expect(updated.title).toBe('Promo v2');
    expect(updated.createdAt).toBe(created.createdAt); // preserved across update

    await asAdmin.banners.delete({ id: created.id });
    expect(await asAdmin.banners.list()).toHaveLength(0);
  });

  it('update on a missing id throws NOT_FOUND (frontend falls back to create on this)', async () => {
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(asAdmin.banners.update({ id: 'does-not-exist', title: 'X', ...baseFields })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('forViewer filters by placement and role via matchesViewer', async () => {
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await asAdmin.banners.create({ title: 'Coach only', ...baseFields, placement: 'coach_dashboard', roles: ['coach'] });
    await asAdmin.banners.create({ title: 'Client only', ...baseFields, placement: 'client_home', roles: ['client'] });
    await asAdmin.banners.create({ title: 'Everyone', ...baseFields, placement: 'all', roles: [] });

    const asCoach = appRouter.createCaller(ctxFor(coach));
    const visible = await asCoach.banners.forViewer({ placement: 'coach_dashboard' });
    expect(visible.map((b) => b.title).sort()).toEqual(['Coach only', 'Everyone']);
  });
});
