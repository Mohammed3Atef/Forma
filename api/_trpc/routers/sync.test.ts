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

function authedUser(overrides: Partial<UserDoc>): AuthedUser {
  const doc = userDoc(overrides);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

const client = authedUser({ _id: 'client-1', role: 'client' });
const otherClient = authedUser({ _id: 'client-2', role: 'client' });
const suspendedClient = authedUser({ _id: 'client-3', role: 'client', accountStatus: 'suspended' });
const pendingClient = authedUser({ _id: 'client-4', role: 'client', accountStatus: 'pending' });

describe('sync module', () => {
  it('rejects an unauthenticated caller', async () => {
    const anon = appRouter.createCaller(ctxFor(null));
    await expect(anon.sync.push({ collection: 'workoutLogs', records: [] })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anon.sync.pull({ collection: 'workoutLogs' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('pushes then pulls records scoped to the caller, with an incremental since-cursor', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));

    const pushed = await asClient.sync.push({
      collection: 'workoutLogs',
      records: [{ id: '2026-09-01', updatedAt: 100, data: { date: '2026-09-01', finished: true } }],
    });
    expect(pushed.pushed).toBe(1);

    const firstPull = await asClient.sync.pull({ collection: 'workoutLogs' });
    expect(firstPull.records).toHaveLength(1);
    expect(firstPull.records[0].id).toBe('2026-09-01');

    // a second push (a new record) — pulling `since` the first watermark only returns the new one
    await asClient.sync.push({
      collection: 'workoutLogs',
      records: [{ id: '2026-09-02', updatedAt: 200, data: { date: '2026-09-02', finished: true } }],
    });
    const secondPull = await asClient.sync.pull({ collection: 'workoutLogs', since: firstPull.maxSyncedAt });
    expect(secondPull.records).toHaveLength(1);
    expect(secondPull.records[0].id).toBe('2026-09-02');

    // another user's data is never visible
    const asOtherClient = appRouter.createCaller(ctxFor(otherClient));
    const otherPull = await asOtherClient.sync.pull({ collection: 'workoutLogs' });
    expect(otherPull.records).toHaveLength(0);
  });

  it('deletions: pushing a deletion removes the live record and is visible to a subsequent deletions.pull', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.sync.push({ collection: 'weightLogs', records: [{ id: '2026-09-01', updatedAt: 100, data: { weightKg: 80 } }] });

    const flushed = await asClient.sync.deletionsPush({ deletions: [{ collection: 'weightLogs', id: '2026-09-01', deletedAt: 150 }] });
    expect(flushed.flushed).toBe(1);

    const pullAfterDelete = await asClient.sync.pull({ collection: 'weightLogs' });
    expect(pullAfterDelete.records).toHaveLength(0);

    const deletions = await asClient.sync.deletionsPull({});
    expect(deletions.deletions).toEqual([{ collection: 'weightLogs', id: '2026-09-01', deletedAt: 150 }]);
  });

  it('singleton: last-write-wins by updatedAt, rejecting a stale write with `stale: true`', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    const first = await asClient.sync.singletonSet({ name: 'settings', data: { theme: 'dark' }, updatedAt: 100 });
    expect(first.stale).toBe(false);

    const stale = await asClient.sync.singletonSet({ name: 'settings', data: { theme: 'light' }, updatedAt: 50 });
    expect(stale.stale).toBe(true);
    expect(stale.data).toEqual({ theme: 'dark' });

    const fresh = await asClient.sync.singletonSet({ name: 'settings', data: { theme: 'light' }, updatedAt: 200 });
    expect(fresh.stale).toBe(false);

    const got = await asClient.sync.singletonGet({ name: 'settings' });
    expect(got?.data).toEqual({ theme: 'light' });
  });

  it('wipe deletes ALL of the caller\'s own synced data (records, deletions, singletons) and nothing else\'s', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    const asOtherClient = appRouter.createCaller(ctxFor(otherClient));
    await asClient.sync.push({ collection: 'weightLogs', records: [{ id: '2026-09-01', updatedAt: 100, data: { weightKg: 80 } }] });
    await asClient.sync.singletonSet({ name: 'settings', data: { theme: 'dark' }, updatedAt: 100 });
    await asOtherClient.sync.push({ collection: 'weightLogs', records: [{ id: '2026-09-01', updatedAt: 100, data: { weightKg: 70 } }] });

    await asClient.sync.wipe();

    expect((await asClient.sync.pull({ collection: 'weightLogs' })).records).toHaveLength(0);
    expect(await asClient.sync.singletonGet({ name: 'settings' })).toBeNull();
    expect((await asOtherClient.sync.pull({ collection: 'weightLogs' })).records).toHaveLength(1);
  });

  it('a pending or suspended account can still push/pull/wipe its own data — matches the old REST handlers, which never checked accountStatus', async () => {
    const asSuspended = appRouter.createCaller(ctxFor(suspendedClient));
    const asPending = appRouter.createCaller(ctxFor(pendingClient));

    await asSuspended.sync.push({ collection: 'weightLogs', records: [{ id: '2026-09-01', updatedAt: 100, data: { weightKg: 80 } }] });
    expect((await asSuspended.sync.pull({ collection: 'weightLogs' })).records).toHaveLength(1);
    await asSuspended.sync.wipe();

    await asPending.sync.push({ collection: 'weightLogs', records: [{ id: '2026-09-01', updatedAt: 100, data: { weightKg: 60 } }] });
    expect((await asPending.sync.pull({ collection: 'weightLogs' })).records).toHaveLength(1);
  });
});
