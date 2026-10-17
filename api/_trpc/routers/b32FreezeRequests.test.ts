import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

/**
 * B3.2 / B32-P1 (owner, 2026-10-17): Today's freeze requests come from the
 * canonical request documents, not the notification feed. A pending request
 * stays listed however many notifications arrive after it, and leaves only
 * when it is decided, cancelled, or no longer this coach's (relationship
 * ended / raised under a previous relationship). Large rosters page without
 * loss or duplicates.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
async function insertUser(over: Partial<UserDoc>): Promise<UserDoc> {
  const now = Date.now();
  const doc: UserDoc = {
    _id: 'user-1', email: `${over._id}@example.com`, emailLower: `${over._id}@example.com`, passwordHash: 'x', displayName: String(over._id), role: 'coach',
    accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...over,
  };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return doc;
}
const authed = (d: UserDoc): AuthedUser => ({ id: d._id, role: d.role, accountStatus: d.accountStatus, permissions: d.permissions, doc: d });
const ctx = (u: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u });
const caller = (d: UserDoc) => appRouter.createCaller(ctx(authed(d)));
async function givePlan(coachId: string, maxClients = 10) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: coachId, plan: 'trial', status: 'active', maxClients, activeClientCount: 0, startedAt: now, endsAt: null, createdAt: now, updatedAt: now });
}
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('subscriptionRequest.pendingForCoach (B32-P1)', () => {
  it('a pending request stays listed after 60 newer notifications — the feed (newest 50) no longer has it', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coach._id);
    await caller(coach).coachClients.assign({ clientId: client._id, subscription: { status: 'active', months: 1 } });
    await caller(client).subscriptionRequest.submit({ reason: 'Travelling for work', from: Date.now() + DAY, until: Date.now() + 8 * DAY });
    await tick();
    const now = Date.now();
    await (await getDb()).collection('notifications').insertMany(
      Array.from({ length: 60 }, (_, i) => ({ _id: `n-${i}`, clientId: client._id, forRole: 'coach', type: 'message_received', body: 'hi', coachId: coach._id, createdAt: now + i + 1, createdBy: client._id, updatedAt: now + i + 1, seenAt: null })) as never[],
    );

    const feed = await caller(coach).notifications.list({});
    expect(feed.notifications.some((n) => n.type === 'freeze_requested')).toBe(false); // the old source has lost it
    const page = await caller(coach).subscriptionRequest.pendingForCoach({});
    expect(page.items).toEqual([expect.objectContaining({ clientId: client._id, reason: 'Travelling for work' })]);
    expect(page.nextCursor).toBeNull();
  });

  it('it leaves only when decided, cancelled by the client, or the relationship ends', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    await givePlan(coach._id);
    const asCoach = caller(coach);
    const asClient = caller(client);
    await asCoach.coachClients.assign({ clientId: client._id, subscription: { status: 'active', months: 1 } });
    const pending = async () => (await asCoach.subscriptionRequest.pendingForCoach({})).items.map((i) => i.clientId);

    await asClient.subscriptionRequest.submit({ reason: 'one' });
    expect(await pending()).toEqual([client._id]);
    await asCoach.subscriptionRequest.decide({ clientId: client._id, outcome: 'rejected', coachNote: 'Not this month' });
    expect(await pending()).toEqual([]);

    await asClient.subscriptionRequest.submit({ reason: 'two' });
    expect(await pending()).toEqual([client._id]);
    await asClient.subscriptionRequest.cancel();
    expect(await pending()).toEqual([]);

    await asClient.subscriptionRequest.submit({ reason: 'three' });
    await asCoach.subscriptionRequest.decide({ clientId: client._id, outcome: 'accepted', coachNote: 'OK' });
    expect(await pending()).toEqual([]);

    await asClient.subscriptionRequest.submit({ reason: 'four' });
    expect(await pending()).toEqual([client._id]);
    await asCoach.coachClients.end({ id: `${coach._id}__${client._id}`, reason: 'released' });
    expect(await pending()).toEqual([]);
  });

  it('never another coach\'s request, nor one raised under a previous relationship (after a hand-over)', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await givePlan(b._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(x).subscriptionRequest.submit({ reason: 'for coach A' });

    expect((await caller(b).subscriptionRequest.pendingForCoach({})).items).toEqual([]);
    await expect(caller(b).subscriptionRequest.pendingForCoach({ coachId: a._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(x).subscriptionRequest.pendingForCoach({ coachId: a._id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Hand-over: A releases X, B takes X on. The request X raised under A stays pending in the document,
    // but it belongs to the earlier relationship — neither coach is shown it now.
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    expect((await caller(b).subscriptionRequest.pendingForCoach({})).items).toEqual([]);
    expect((await caller(a).subscriptionRequest.pendingForCoach({})).items).toEqual([]);

    // A new request under B's relationship is B's.
    await tick();
    await caller(x).subscriptionRequest.submit({ reason: 'for coach B' });
    expect((await caller(b).subscriptionRequest.pendingForCoach({})).items).toEqual([expect.objectContaining({ clientId: x._id, reason: 'for coach B' })]);
  });

  it('a 250-client roster pages completely, in order, with no duplicate (ties broken by client)', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const db = await getDb();
    const ids = Array.from({ length: 250 }, (_, i) => `c-${String(i).padStart(3, '0')}`);
    await db.collection('coachClients').insertMany(ids.map((id) => ({ _id: `${coach._id}__${id}`, coachId: coach._id, clientId: id, status: 'active', createdBy: coach._id, createdAt: 1_000, updatedAt: 1_000 })) as never[]);
    // Ten distinct timestamps across 250 requests: every page boundary falls inside a tie.
    await db.collection('subscriptionRequests').insertMany(ids.map((id, i) => ({ _id: id, clientId: id, reason: `r${i}`, status: 'pending', requestedAt: 5_000 + (i % 10), updatedAt: 5_000 })) as never[]);
    // A decided one and one for a client outside the roster must not appear.
    await db.collection<{ _id: string }>('subscriptionRequests').updateOne({ _id: 'c-007' }, { $set: { status: 'accepted' } });
    await db.collection('subscriptionRequests').insertOne({ _id: 'stranger', clientId: 'stranger', reason: 'x', status: 'pending', requestedAt: 5_000, updatedAt: 5_000 } as never);

    const seen: string[] = [];
    let cursor: { requestedAt: number; clientId: string } | undefined;
    let pages = 0;
    do {
      const page = await caller(coach).subscriptionRequest.pendingForCoach({ limit: 100, cursor });
      expect(page.items.length).toBeLessThanOrEqual(100);
      seen.push(...page.items.map((i) => i.clientId));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual(ids.filter((id) => id !== 'c-007').sort());
  });

  it('a suspended coach keeps read-only access to their own list (R-3), like their other roster summaries', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach', accountStatus: 'suspended' });
    await (await getDb()).collection('coachClients').insertOne({ _id: 'coach-1__c1', coachId: coach._id, clientId: 'c1', status: 'active', createdBy: coach._id, createdAt: 1, updatedAt: 1 } as never);
    await (await getDb()).collection('subscriptionRequests').insertOne({ _id: 'c1', clientId: 'c1', reason: 'r', status: 'pending', requestedAt: 2, updatedAt: 2 } as never);
    expect((await caller(coach).subscriptionRequest.pendingForCoach({})).items.map((i) => i.clientId)).toEqual(['c1']);
  });
});
