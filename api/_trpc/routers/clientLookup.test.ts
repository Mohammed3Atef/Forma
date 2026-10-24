import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B0 / CO-03 — "Add Existing Client" can't enumerate the platform's clients or
 * leak another coach's client's contact details / internal fields.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_client_lookup';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function user(_id: string, role: UserDoc['role'], extra: Partial<UserDoc> = {}): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id, email: `${_id}@t.test`, emailLower: `${_id}@t.test`, passwordHash: 'x', displayName: _id, displayNameLower: _id.toLowerCase(), role, accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...extra } as UserDoc;
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id); // B38F-R3: a real coach always has a plan
  return { id: _id, role, accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });

async function setup() {
  const coachA = await user('coach-a', 'coach');
  const coachB = await user('coach-b', 'coach');
  await user('carla', 'client', { email: 'Carla@Example.com', emailLower: 'carla@example.com', phone: '+201001234567', displayName: 'Carla', displayNameLower: 'carla', assignedCoachId: 'coach-a', permissions: [] });
  await user('cody', 'client', { email: 'cody@example.com', emailLower: 'cody@example.com', displayName: 'Cody', displayNameLower: 'cody' });
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-a__carla', coachId: 'coach-a', clientId: 'carla', status: 'active' } as never);
  return { asA: appRouter.createCaller(ctx(coachA)), asB: appRouter.createCaller(ctx(coachB)) };
}

describe('Add Existing Client lookup (CO-03)', () => {
  it('a coach cannot enumerate clients by a letter or a name prefix', async () => {
    const { asB } = await setup();
    expect(await asB.adminUsers.searchClients({ value: 'c' })).toEqual([]);
    expect(await asB.adminUsers.searchClients({ value: 'Car' })).toEqual([]);
    expect(await asB.adminUsers.searchClients({ value: 'Carla' })).toEqual([]);
    expect(await asB.adminUsers.searchClients({ value: 'example.com' })).toEqual([]);
  });

  it("an exact email (any case) finds another coach's client with minimal fields only", async () => {
    const { asB } = await setup();
    const res = await asB.adminUsers.searchClients({ value: '  CARLA@example.com ' });
    expect(res).toEqual([{ id: 'carla', displayName: 'Carla', coaching: 'another' }]);
    const json = JSON.stringify(res);
    for (const leak of ['coach-a', '+2010', 'Carla@Example.com', 'permissions', 'featureFlags', 'createdBy', 'assignedCoachId', 'passwordHash']) {
      expect(json).not.toContain(leak);
    }
  });

  it('an exact phone finds the client; an unassigned client shows its account status', async () => {
    const { asA, asB } = await setup();
    expect(await asB.adminUsers.searchClients({ value: '+201001234567' })).toEqual([{ id: 'carla', displayName: 'Carla', coaching: 'another' }]);
    expect(await asA.adminUsers.searchClients({ value: '+201001234567' })).toEqual([{ id: 'carla', displayName: 'Carla', coaching: 'you', accountStatus: 'active' }]);
    expect(await asB.adminUsers.searchClients({ value: 'cody@example.com' })).toEqual([{ id: 'cody', displayName: 'Cody', coaching: 'none', accountStatus: 'active' }]);
  });

  it('clients cannot use the lookup', async () => {
    await setup();
    const asClient = appRouter.createCaller(ctx({ id: 'cody', role: 'client', accountStatus: 'active', permissions: [], doc: {} as UserDoc }));
    await expect(asClient.adminUsers.searchClients({ value: 'carla@example.com' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lookups are audited and rate-limited per coach', async () => {
    const { asB } = await setup();
    await asB.adminUsers.searchClients({ value: 'carla@example.com' });
    const audit = await (await getDb()).collection('adminAuditLogs').find({ action: 'client.lookup' }).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: 'coach-b', metadata: { kind: 'email', matches: 1 } });
    expect(JSON.stringify(audit[0])).not.toContain('carla@example.com');
    for (let i = 0; i < 29; i++) await asB.adminUsers.searchClients({ value: `nobody${i}@x.test` });
    await expect(asB.adminUsers.searchClients({ value: 'carla@example.com' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it("a transfer request no longer needs (or reveals) the current coach's id", async () => {
    const { asB } = await setup();
    const req = await asB.transfers.create({ clientId: 'carla', reason: 'Client asked to switch' });
    expect(req).toMatchObject({ clientId: 'carla', toCoachId: 'coach-b', status: 'pending' });
    const stored = await (await getDb()).collection('transferRequests').findOne({ clientId: 'carla' });
    expect(stored?.fromCoachId).toBe('coach-a');
    await expect(asB.transfers.create({ clientId: 'cody', reason: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
