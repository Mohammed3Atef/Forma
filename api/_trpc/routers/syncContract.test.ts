import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { MAX_RECORDS_PER_PUSH } from '../../sync/_contract.js';

/**
 * B1.7 / PWA-13 — the sync payload contract: known collections only, every
 * record checked on its own (a bad one is rejected with a reason, the rest of
 * the batch still applies), size and batch limits, a schema version, and
 * strict per-user ownership.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_sync_contract';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function client(_id: string): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id, email: `${_id}@t.test`, emailLower: `${_id}@t.test`, passwordHash: 'x', displayName: _id, role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: _id, role: 'client', accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });
const DAY = '2026-10-05';
const now = Date.now();

describe('sync contract (B1.7)', () => {
  it('refuses an unknown collection (push, pull)', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    await expect(me.sync.push({ collection: 'users', records: [{ id: 'x', updatedAt: now, data: {} }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(me.sync.pull({ collection: 'notes', since: 0 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a malformed record on its own — the valid records in the same batch still apply', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    const res = await me.sync.push({
      collection: 'nutritionLogs',
      records: [
        { id: DAY, updatedAt: now, data: { id: DAY, date: DAY, entries: [] } }, // valid
        { id: '2026-10-06', updatedAt: now, data: { id: 'someone-else', date: '2026-10-06' } }, // id mismatch
        { id: '2026-10-07', updatedAt: now, data: { id: '2026-10-07', date: '2026-10-08' } }, // day key ≠ date
        { id: 'not-a-day', updatedAt: now, data: { id: 'not-a-day' } }, // day-keyed collection, bad key
        { id: '2026-10-09', updatedAt: null as unknown as number, data: { id: '2026-10-09' } }, // bad timestamp (JSON has no NaN)
        { id: '2026-10-10', updatedAt: now, data: { id: '2026-10-10', date: '2026-10-10' }, sv: 99 }, // newer schema
        { id: '2026-10-11', updatedAt: now, data: { id: '2026-10-11', date: '2026-10-11', blob: 'x'.repeat(300 * 1024) } }, // too large
      ],
    });
    expect(res.accepted.map((a) => a.id)).toEqual([DAY]);
    expect(res.rejected).toEqual([
      { id: '2026-10-06', reason: 'ID_MISMATCH' },
      { id: '2026-10-07', reason: 'BAD_DATE' },
      { id: 'not-a-day', reason: 'BAD_ID' },
      { id: '2026-10-09', reason: 'BAD_UPDATED_AT' },
      { id: '2026-10-10', reason: 'UNSUPPORTED_VERSION' },
      { id: '2026-10-11', reason: 'TOO_LARGE' },
    ]);
    const pulled = await me.sync.pull({ collection: 'nutritionLogs', since: 0 });
    expect(pulled.records.map((r) => r.id)).toEqual([DAY]);
  });

  it('a wrong device clock is not a rejection (revisions decide; the data is not stranded)', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    const res = await me.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: 9_999_999_999_999, data: { id: DAY, date: DAY, weightKg: 80 }, baseRev: null }] });
    expect(res.rejected).toEqual([]);
    expect(res.accepted).toHaveLength(1);
  });

  it('caps the batch size', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    const records = Array.from({ length: MAX_RECORDS_PER_PUSH + 1 }, (_, i) => ({ id: `r${i}`, updatedAt: now, data: { id: `r${i}` } }));
    await expect(me.sync.push({ collection: 'reminders', records })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('stores and returns the schema version (pre-B1 records read as 1)', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    await me.sync.push({ collection: 'reminders', records: [{ id: 'rem1', updatedAt: now, data: { id: 'rem1' }, sv: 1 }] });
    await (await getDb()).collection('syncRecords').insertOne({ _id: 'c1__reminders__legacy', clientId: 'c1', collection: 'reminders', recordId: 'legacy', data: { id: 'legacy' }, updatedAt: now, syncedAt: now } as never);
    const pulled = await me.sync.pull({ collection: 'reminders', since: 0 });
    expect(pulled.records.map((r) => [r.id, r.sv]).sort()).toEqual([
      ['legacy', 1],
      ['rem1', 1],
    ]);
  });

  it('ownership: a record is stored under the caller only; another client can neither read nor overwrite it', async () => {
    const a = appRouter.createCaller(ctx(await client('ca')));
    const b = appRouter.createCaller(ctx(await client('cb')));
    await a.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: now, data: { id: DAY, date: DAY, weightKg: 70 }, baseRev: null }] });
    expect((await b.sync.pull({ collection: 'weightLogs', since: 0 })).records).toEqual([]);
    await b.sync.push({ collection: 'weightLogs', records: [{ id: DAY, updatedAt: now + 1, data: { id: DAY, date: DAY, weightKg: 99 }, baseRev: null }] });
    expect((await a.sync.pull({ collection: 'weightLogs', since: 0 })).records[0].data).toMatchObject({ weightKg: 70 });
  });

  it('never stores a tombstone for an unknown collection', async () => {
    const me = appRouter.createCaller(ctx(await client('c1')));
    await me.sync.deletionsPush({ deletions: [{ collection: 'users', id: 'c1', deletedAt: now }] });
    expect((await me.sync.deletionsPull({ since: 0 })).deletions).toEqual([]);
  });
});
