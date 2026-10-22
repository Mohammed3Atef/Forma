import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B1.6 — the server half of the durable outbox: a write the device retries
 * (because it never saw the answer) must not fail or happen twice.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_outbox_idem';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function user(_id: string, role: UserDoc['role']): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id, email: `${_id}@t.test`, emailLower: `${_id}@t.test`, passwordHash: 'x', displayName: _id, role, accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id); // B38F-R3: a real coach always has a plan
  return { id: _id, role, accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });

async function setup() {
  const coach = await user('coach-1', 'coach');
  const client = await user('client-1', 'client');
  const other = await user('client-2', 'client');
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-1', coachId: 'coach-1', clientId: 'client-1', status: 'active', subscription: { status: 'active', startAt: Date.now() - 1000, endAt: Date.now() + 30 * 86_400_000 } } as never);
  return { asCoach: appRouter.createCaller(ctx(coach)), asClient: appRouter.createCaller(ctx(client)), asOther: appRouter.createCaller(ctx(other)) };
}
const WEEK = '2026-09-28';

describe('check-in submit is idempotent by operation id', () => {
  it('a replay with the same opId returns the stored submission instead of FORBIDDEN', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    const first = await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-1' });
    expect(first?.status).toBe('submitted');
    const replay = await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-1' });
    expect(replay?.status).toBe('submitted');
    expect(replay?.submittedAt).toBe(first?.submittedAt); // not written twice
    const coachFeed = await asCoach.notifications.list();
    expect(coachFeed.notifications.filter((n) => n.type === 'checkin_submitted')).toHaveLength(1); // no second notification
  });

  it('a DIFFERENT submission for an already-submitted week is still refused', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-1' });
    await expect(asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 75, opId: 'op-2' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 75 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('two racing submits of the same op produce one submission', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    const results = await Promise.allSettled([1, 2, 3].map(() => asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-race' })));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const doc = await (await getDb()).collection('checkIns').findOne({ _id: `client-1__${WEEK}` } as never);
    expect(doc).toMatchObject({ status: 'submitted', submitOpId: 'op-race' });
  });

  it('another account replaying the op id is refused (ownership)', async () => {
    const { asCoach, asClient, asOther } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-1' });
    await expect(asOther.checkIns.submit({ clientId: 'client-1', weekStart: WEEK, opId: 'op-1' })).rejects.toBeTruthy();
  });

  it('a failing notification does not fail an already-committed submit', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    const db = await getDb();
    const real = db.collection.bind(db);
    const spy = vi.spyOn(db, 'collection').mockImplementation(((name: string, ...rest: unknown[]) => {
      const col = real(name, ...(rest as []));
      if (name === 'notifications') return { ...col, insertOne: async () => Promise.reject(new Error('notifications down')) } as never;
      return col;
    }) as never);
    const errLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80, opId: 'op-n' });
      expect(res?.status).toBe('submitted');
    } finally {
      spy.mockRestore();
      errLog.mockRestore();
    }
  });
});

describe('message send is idempotent by clientMsgId (the outbox key)', () => {
  it('the same op sent three times creates one message', async () => {
    const { asClient } = await setup();
    const a = await asClient.messages.send({ clientId: 'client-1', text: 'hello', clientMsgId: 'op-msg-1' });
    const b = await asClient.messages.send({ clientId: 'client-1', text: 'hello', clientMsgId: 'op-msg-1' });
    const c = await asClient.messages.send({ clientId: 'client-1', text: 'hello', clientMsgId: 'op-msg-1' });
    expect(b.id).toBe(a.id);
    expect(c.id).toBe(a.id);
    const n = await (await getDb()).collection('messages').countDocuments({ clientId: 'client-1' });
    expect(n).toBe(1);
  });
});
