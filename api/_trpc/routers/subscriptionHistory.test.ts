import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/** B0 / CO-15 — a new term archives the previous one instead of overwriting it. */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_sub_history';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
async function setup(sub: Record<string, unknown>) {
  const now = Date.now();
  const doc: UserDoc = { _id: 'coach-1', email: 'c@t.test', emailLower: 'c@t.test', passwordHash: 'x', displayName: 'Coach', role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-1', coachId: 'coach-1', clientId: 'client-1', status: 'active', subscription: sub, createdAt: now, updatedAt: now } as never);
  const u: AuthedUser = { id: 'coach-1', role: 'coach', accountStatus: 'active', permissions: [], doc };
  return appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
}
const rel = async () => (await getDb()).collection('coachClients').findOne({ _id: 'coach-1__client-1' } as never);

describe('subscription term history (CO-15)', () => {
  it('renewing archives the previous paid term with its price', async () => {
    const start = Date.now() - 40 * DAY;
    const asCoach = await setup({ status: 'active', startAt: start, endAt: Date.now() - 10 * DAY, months: 1, price: 1000, currency: 'EGP', updatedAt: start });
    const renewed = await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'setTerm', startAt: Date.now(), months: 3, price: 2700, currency: 'EGP' } });
    expect(renewed.subscription).toMatchObject({ price: 2700, months: 3, status: 'active' });
    expect(renewed.subscriptionHistory).toEqual([expect.objectContaining({ startAt: start, price: 1000, currency: 'EGP', months: 1, status: 'expired' })]);
    expect((await rel())?.subscriptionHistory).toHaveLength(1);
  });

  it('every renewal is kept (two renewals → two archived terms); an early renewal is marked ended', async () => {
    const asCoach = await setup({ status: 'active', startAt: Date.now() - 5 * DAY, endAt: Date.now() + 25 * DAY, months: 1, price: 800, updatedAt: 1 });
    await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'setTerm', startAt: Date.now(), months: 1, price: 900 } });
    await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'setTerm', startAt: Date.now(), months: 1, price: 950 } });
    const history = (await rel())?.subscriptionHistory as { price: number; status: string }[];
    expect(history.map((h) => h.price)).toEqual([800, 900]);
    expect(history[0].status).toBe('ended');
  });

  it('price edits, freezes and extensions change the current term without archiving', async () => {
    const asCoach = await setup({ status: 'active', startAt: Date.now() - DAY, endAt: Date.now() + 29 * DAY, months: 1, price: 800, updatedAt: 1 });
    await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'setPrice', price: 850 } });
    await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'extend', days: 7 } });
    await asCoach.coachClients.updateSubscription({ id: 'coach-1__client-1', sub: { op: 'freeze', from: Date.now(), until: Date.now() + 7 * DAY } });
    expect((await rel())?.subscriptionHistory ?? []).toHaveLength(0);
  });
});
