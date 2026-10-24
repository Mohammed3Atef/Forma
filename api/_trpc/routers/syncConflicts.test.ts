import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/**
 * B0 / PWA-06 (+ PWA-03) — cross-device writes and deletes are conditional on
 * the server revision a device last saw. A stale device gets the server copy
 * back as a conflict instead of silently overwriting (or deleting) newer data.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_sync_conflicts';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function client(_id: string) {
  const now = Date.now();
  const doc: UserDoc = { _id, email: `${_id}@t.test`, emailLower: `${_id}@t.test`, passwordHash: 'x', displayName: _id, role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  const u: AuthedUser = { id: _id, role: 'client', accountStatus: 'active', permissions: [], doc };
  return appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
}

const DAY = '2026-10-05';

describe('sync revisions (PWA-06)', () => {
  it('phone + tablet: the second device to create the same day gets a conflict, not an overwrite', async () => {
    const me = await client('c1');
    // Phone logs breakfast + lunch and syncs (creates rev 1).
    const phone = await me.sync.push({ collection: 'nutritionLogs', records: [{ id: DAY, updatedAt: 100, data: { id: DAY, meals: ['breakfast', 'lunch'] }, baseRev: null }] });
    expect(phone.accepted).toEqual([{ id: DAY, rev: 1 }]);
    // Tablet (never pulled) logs water for the same day with a NEWER clock.
    const tablet = await me.sync.push({ collection: 'nutritionLogs', records: [{ id: DAY, updatedAt: 999, data: { id: DAY, meals: [], water: 500 }, baseRev: null }] });
    expect(tablet.accepted).toEqual([]);
    expect(tablet.conflicts).toEqual([{ id: DAY, updatedAt: 100, rev: 1, data: { id: DAY, meals: ['breakfast', 'lunch'] } }]);
    const pulled = await me.sync.pull({ collection: 'nutritionLogs', since: 0 });
    expect(pulled.records[0]).toMatchObject({ rev: 1, data: { meals: ['breakfast', 'lunch'] } });
  });

  it('a stale base revision is refused; the current base is applied', async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 1, data: { v: 1 }, baseRev: null }] });
    await me.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 2, data: { v: 2 }, baseRev: 1 }] }); // device A → rev 2
    const stale = await me.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 3, data: { v: 'B' }, baseRev: 1 }] }); // device B still on rev 1
    expect(stale.conflicts[0]).toMatchObject({ rev: 2, data: { v: 2 } });
    const ok = await me.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 4, data: { v: 'B' }, baseRev: 2 }] }); // after resolving
    expect(ok.accepted).toEqual([{ id: DAY, rev: 3 }]);
  });

  it("a device's clock can't win: a fast-clock stale write is still a conflict", async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: 10, data: { kg: 80 }, baseRev: null }] });
    await me.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: 20, data: { kg: 79 }, baseRev: 1 }] });
    const fastClock = await me.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: 9_999_999_999_999, data: { kg: 90 }, baseRev: 1 }] });
    expect(fastClock.accepted).toEqual([]);
    expect((await me.sync.pull({ collection: 'weightLogs', since: 0 })).records[0].data).toEqual({ kg: 79 });
  });

  it('a pre-revision client can never replace a newer copy with an older edit', async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'dailyChecklists', records: [{ id: DAY, updatedAt: 50, data: { done: 3 } }] });
    const older = await me.sync.push({ collection: 'dailyChecklists', records: [{ id: DAY, updatedAt: 40, data: { done: 1 } }] });
    expect(older.accepted).toEqual([]);
    expect(older.conflicts).toHaveLength(1);
    expect((await me.sync.pull({ collection: 'dailyChecklists', since: 0 })).records[0].data).toEqual({ done: 3 });
  });

  it('a stale delete is refused and the edited copy returned (edit beats delete)', async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'nutritionLogs', records: [{ id: DAY, updatedAt: 1, data: { meals: ['a'] }, baseRev: null }] });
    await me.sync.push({ collection: 'nutritionLogs', records: [{ id: DAY, updatedAt: 2, data: { meals: ['a', 'b'] }, baseRev: 1 }] }); // edited elsewhere
    const del = await me.sync.deletionsPush({ deletions: [{ collection: 'nutritionLogs', id: DAY, deletedAt: 3, baseRev: 1 }] });
    expect(del.flushed).toBe(0);
    expect(del.rejected[0]).toMatchObject({ collection: 'nutritionLogs', id: DAY, rev: 2 });
    expect((await me.sync.pull({ collection: 'nutritionLogs', since: 0 })).records).toHaveLength(1);
    expect((await me.sync.deletionsPull({ since: 0 })).deletions).toEqual([]);
  });

  it("a delete for a record this device never had can't remove another device's record", async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 1, data: { real: true }, baseRev: null }] });
    const del = await me.sync.deletionsPush({ deletions: [{ collection: 'workoutLogs', id: DAY, deletedAt: 99, baseRev: null }] });
    expect(del.rejected).toHaveLength(1);
    expect((await me.sync.pull({ collection: 'workoutLogs', since: 0 })).records).toHaveLength(1);
  });

  it('a current delete removes the record and writes the marker other devices apply', async () => {
    const me = await client('c1');
    await me.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: 1, data: { kg: 80 }, baseRev: null }] });
    const del = await me.sync.deletionsPush({ deletions: [{ collection: 'weightLogs', id: DAY, deletedAt: 2, baseRev: 1 }] });
    expect(del).toMatchObject({ flushed: 1, rejected: [] });
    expect((await me.sync.pull({ collection: 'weightLogs', since: 0 })).records).toEqual([]);
    expect((await me.sync.deletionsPull({ since: 0 })).deletions).toEqual([expect.objectContaining({ collection: 'weightLogs', id: DAY })]);
  });

  it("revisions are per account: another client's records are never touched", async () => {
    const a = await client('a');
    const b = await client('b');
    await a.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 1, data: { who: 'a' }, baseRev: null }] });
    const bRes = await b.sync.push({ collection: 'workoutLogs', records: [{ id: DAY, updatedAt: 1, data: { who: 'b' }, baseRev: null }] });
    expect(bRes.accepted).toEqual([{ id: DAY, rev: 1 }]);
    await b.sync.deletionsPush({ deletions: [{ collection: 'workoutLogs', id: DAY, deletedAt: 5, baseRev: 1 }] });
    expect((await a.sync.pull({ collection: 'workoutLogs', since: 0 })).records[0].data).toEqual({ who: 'a' });
  });
});
