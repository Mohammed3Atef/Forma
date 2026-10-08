import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';

/**
 * B0 / NT-03 — a notification's task, once done, resolves it (it stops being
 * unread and is marked Done), and "Mark all read" clears the badge.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_notif_lifecycle';
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
  return { id: _id, role, accountStatus: 'active', permissions: [], doc };
}
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });

async function setup() {
  const coach = await user('coach-1', 'coach');
  const client = await user('client-1', 'client');
  await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-1', coachId: 'coach-1', clientId: 'client-1', status: 'active', subscription: { status: 'active', startAt: Date.now() - 1000, endAt: Date.now() + 30 * 86_400_000 } } as never);
  return { asCoach: appRouter.createCaller(ctx(coach)), asClient: appRouter.createCaller(ctx(client)) };
}
const WEEK = '2026-09-28';
const ofType = (feed: { notifications: { type: string; seenAt?: number | null; resolvedAt?: number | null }[] }, type: string) => feed.notifications.filter((n) => n.type === type);

describe('notification lifecycle (NT-03)', () => {
  it('check-in requested → resolved when the client submits; submitted → resolved when the coach reviews', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    let feed = await asClient.notifications.list();
    expect(feed.unreadCount).toBe(1);
    expect(ofType(feed, 'checkin_requested')[0]).toMatchObject({ seenAt: null });

    await asClient.checkIns.submit({ weekStart: WEEK, currentWeight: 80 });
    feed = await asClient.notifications.list();
    expect(feed.unreadCount).toBe(0);
    expect(ofType(feed, 'checkin_requested')[0].resolvedAt).toEqual(expect.any(Number));

    let coachFeed = await asCoach.notifications.list();
    expect(ofType(coachFeed, 'checkin_submitted')[0]).toMatchObject({ seenAt: null });
    await asCoach.checkIns.review({ clientId: 'client-1', weekStart: WEEK, feedback: 'Good week' });
    coachFeed = await asCoach.notifications.list();
    expect(ofType(coachFeed, 'checkin_submitted')[0].resolvedAt).toEqual(expect.any(Number));
    expect(coachFeed.unreadCount).toBe(0);
  });

  it('freeze requested → resolved when the coach decides (or the client cancels)', async () => {
    const { asCoach, asClient } = await setup();
    await asClient.subscriptionRequest.submit({ reason: 'Travel' });
    expect((await asCoach.notifications.list()).unreadCount).toBe(1);
    await asCoach.subscriptionRequest.decide({ clientId: 'client-1', outcome: 'accepted', coachNote: 'ok' });
    const coachFeed = await asCoach.notifications.list();
    expect(ofType(coachFeed, 'freeze_requested')[0].resolvedAt).toEqual(expect.any(Number));
    expect(coachFeed.unreadCount).toBe(0);

    await asClient.subscriptionRequest.submit({ reason: 'Again' });
    await asClient.subscriptionRequest.cancel();
    expect((await asCoach.notifications.list()).unreadCount).toBe(0);
  });

  it('message notifications resolve when that thread is read', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.messages.send({ clientId: 'client-1', text: 'Hi' });
    await asCoach.messages.send({ clientId: 'client-1', text: 'How was the session?' });
    expect((await asClient.notifications.list()).unreadCount).toBe(2);
    await asClient.messages.markRead({ clientId: 'client-1' });
    const feed = await asClient.notifications.list();
    expect(feed.unreadCount).toBe(0);
    expect(ofType(feed, 'message_received').every((n) => (n as { resolvedAt?: number }).resolvedAt)).toBe(true);
  });

  it('"Mark all read" clears the badge without marking tasks as done', async () => {
    const { asCoach, asClient } = await setup();
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    await asCoach.messages.send({ clientId: 'client-1', text: 'Hi' });
    await asClient.notifications.markRead({});
    const feed = await asClient.notifications.list();
    expect(feed.unreadCount).toBe(0);
    expect(ofType(feed, 'checkin_requested')[0].resolvedAt ?? null).toBeNull(); // read, still to do
  });

  it("resolution never touches another client's notifications", async () => {
    const { asCoach, asClient } = await setup();
    const other = await user('client-2', 'client');
    await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__client-2', coachId: 'coach-1', clientId: 'client-2', status: 'active' } as never);
    await asCoach.checkIns.request({ clientId: 'client-1', weekStart: WEEK, weekEnd: '2026-10-04' });
    await asCoach.checkIns.request({ clientId: 'client-2', weekStart: WEEK, weekEnd: '2026-10-04' });
    await asClient.checkIns.submit({ weekStart: WEEK });
    const otherFeed = await appRouter.createCaller(ctx(other)).notifications.list();
    expect(otherFeed.unreadCount).toBe(1);
  });
});
