import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

/**
 * B3.3 server changes for the Clients directory (owner brief 2026-10-17):
 *  - `toReview` is the CURRENT coach's work only (a previous coach's check-in never flags a transferred client);
 *  - `coachClients.list({ view: 'summary' })` drops the audit trail / archived terms (roster payload at scale);
 *  - the requesting coach never learns who currently coaches the client (outgoing transfers, CO-03);
 *  - revoking an invite never overwrites a claim.
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

async function insertUser(over: Partial<UserDoc>): Promise<UserDoc> {
  const now = Date.now();
  const doc: UserDoc = {
    _id: 'user-1', email: `${over._id}@example.com`, emailLower: `${over._id}@example.com`, passwordHash: 'x', displayName: String(over._id), role: 'coach',
    accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...over,
  };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return doc;
}
const caller = (d: UserDoc) =>
  appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: { id: d._id, role: d.role, accountStatus: d.accountStatus, permissions: d.permissions, doc: d } as AuthedUser } as Context);
async function givePlan(coachId: string, maxClients = 10) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: coachId, plan: 'trial', status: 'active', maxClients, activeClientCount: 0, startedAt: now, endsAt: null, createdAt: now, updatedAt: now });
}
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('dashboardSummaries.toReview — the current coach only (B3.3)', () => {
  it('a previous coach\'s submitted check-in never flags the client for the new coach; the new coach\'s own does', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await givePlan(b._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).checkIns.request({ clientId: x._id, weekStart: '2026-09-05', weekEnd: '2026-09-11' });
    await caller(x).checkIns.submit({ clientId: x._id, weekStart: '2026-09-05', currentWeight: 70 });
    expect((await caller(a).coachClients.dashboardSummaries({}))[0]).toMatchObject({ clientId: x._id, toReview: true });

    // Hand-over: A releases, B takes X on. A's check-in is still "submitted" — but it is not B's to review.
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    expect((await caller(b).coachClients.dashboardSummaries({}))[0]).toMatchObject({ clientId: x._id, toReview: false });

    await caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-12', weekEnd: '2026-09-18' });
    await caller(x).checkIns.submit({ clientId: x._id, weekStart: '2026-09-12', currentWeight: 69.5 });
    expect((await caller(b).coachClients.dashboardSummaries({}))[0]).toMatchObject({ clientId: x._id, toReview: true });
  });

  it('a legacy check-in without coachId counts only when submitted after this relationship began; an admin sees the coach\'s scope', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'super_admin' });
    const db = await getDb();
    await db.collection('coachClients').insertMany([
      { _id: 'coach-1__old', coachId: coach._id, clientId: 'old', status: 'active', createdBy: coach._id, createdAt: 10_000, updatedAt: 10_000 },
      { _id: 'coach-1__new', coachId: coach._id, clientId: 'new', status: 'active', createdBy: coach._id, createdAt: 10_000, updatedAt: 10_000 },
    ] as never[]);
    await db.collection('checkIns').insertMany([
      { _id: 'old__w1', clientId: 'old', weekStart: '2026-09-05', weekEnd: '2026-09-11', status: 'submitted', submittedAt: 5_000, progressPhotos: {}, createdAt: 4_000, updatedAt: 5_000 },
      { _id: 'new__w1', clientId: 'new', weekStart: '2026-09-05', weekEnd: '2026-09-11', status: 'submitted', submittedAt: 20_000, progressPhotos: {}, createdAt: 15_000, updatedAt: 20_000 },
    ] as never[]);
    const byClient = (rows: { clientId: string; toReview: boolean }[]) => Object.fromEntries(rows.map((r) => [r.clientId, r.toReview]));
    expect(byClient(await caller(coach).coachClients.dashboardSummaries({}))).toEqual({ old: false, new: true });
    expect(byClient(await caller(admin).coachClients.dashboardSummaries({ coachId: coach._id }))).toEqual({ old: false, new: true });
  });
});

describe('checkIns.listForCoachClients — the current coach\'s check-ins only (B3.3)', () => {
  it('a previous coach\'s check-ins never reach the new coach; legacy ones count from the relationship start', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await givePlan(b._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).checkIns.request({ clientId: x._id, weekStart: '2026-09-05', weekEnd: '2026-09-11' });
    await caller(x).checkIns.submit({ clientId: x._id, weekStart: '2026-09-05', currentWeight: 70, notes: 'For coach A' });
    expect((await caller(a).checkIns.listForCoachClients({}))[0]).toMatchObject({ clientId: x._id, latest: { weekStart: '2026-09-05', status: 'submitted' } });

    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    // Coach A's submitted check-in (and its notes) are not B's — not even in the payload.
    const forB = await caller(b).checkIns.listForCoachClients({});
    expect(forB).toEqual([{ clientId: x._id, latest: null, previous: null }]);
    expect(JSON.stringify(forB)).not.toContain('For coach A');

    await caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-12', weekEnd: '2026-09-18' });
    const mine = (await caller(b).checkIns.listForCoachClients({}))[0];
    expect(mine).toMatchObject({ latest: { weekStart: '2026-09-12', status: 'requested', coachId: b._id }, previous: null });

    // A legacy check-in (no coachId) created after B took X on is B's; one from before is not.
    const db = await getDb();
    const since = (await db.collection('coachClients').findOne({ _id: `${b._id}__${x._id}` } as never))!.createdAt as number;
    await db.collection('checkIns').insertMany([
      { _id: `${x._id}__2026-08-29`, clientId: x._id, weekStart: '2026-08-29', weekEnd: '2026-09-04', status: 'reviewed', submittedAt: since - 1000, progressPhotos: {}, createdAt: since - 2000, updatedAt: since - 1000 },
      { _id: `${x._id}__2026-08-22`, clientId: x._id, weekStart: '2026-08-22', weekEnd: '2026-08-28', status: 'reviewed', submittedAt: since + 1000, progressPhotos: {}, createdAt: since + 500, updatedAt: since + 1000 },
    ] as never[]);
    expect((await caller(b).checkIns.listForCoachClients({}))[0]).toMatchObject({ latest: { weekStart: '2026-09-12' }, previous: { weekStart: '2026-08-22' } });
  });
});

describe('checkIns.request — never hands back a previous coach\'s check-in (B3.3)', () => {
  it('a week the previous coach holds is refused (CONFLICT); the coach\'s own week is idempotent; an admin keeps the old behaviour', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'super_admin' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await givePlan(b._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).checkIns.request({ clientId: x._id, weekStart: '2026-09-05', weekEnd: '2026-09-11' });
    await caller(x).checkIns.submit({ clientId: x._id, weekStart: '2026-09-05', notes: 'For coach A' });
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });

    await expect(caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-05', weekEnd: '2026-09-11' })).rejects.toMatchObject({ code: 'CONFLICT', message: 'CHECKIN_WEEK_TAKEN' });
    const db = await getDb();
    expect(await db.collection('checkIns').findOne({ _id: `${x._id}__2026-09-05` } as never)).toMatchObject({ coachId: a._id, status: 'submitted' });

    const own = await caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-12', weekEnd: '2026-09-18' });
    expect(own).toMatchObject({ coachId: b._id, status: 'requested' });
    expect(await caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-12', weekEnd: '2026-09-18' })).toMatchObject({ _id: own._id, coachId: b._id });

    // A legacy week (no coachId) from before B's relationship is not B's either; one created after it is.
    const since = (await db.collection('coachClients').findOne({ _id: `${b._id}__${x._id}` } as never))!.createdAt as number;
    await db.collection('checkIns').insertMany([
      { _id: `${x._id}__2026-08-29`, clientId: x._id, weekStart: '2026-08-29', weekEnd: '2026-09-04', status: 'reviewed', submittedAt: since - 1000, progressPhotos: {}, createdAt: since - 2000, updatedAt: since - 1000 },
      { _id: `${x._id}__2026-09-19`, clientId: x._id, weekStart: '2026-09-19', weekEnd: '2026-09-25', status: 'requested', progressPhotos: {}, createdAt: since + 500, updatedAt: since + 500 },
    ] as never[]);
    await expect(caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-08-29', weekEnd: '2026-09-04' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await caller(b).checkIns.request({ clientId: x._id, weekStart: '2026-09-19', weekEnd: '2026-09-25' })).toMatchObject({ _id: `${x._id}__2026-09-19` });
    // An admin acting for a client still gets the stored week back (unchanged).
    expect(await caller(admin).checkIns.request({ clientId: x._id, weekStart: '2026-09-05', weekEnd: '2026-09-11', coachId: b._id })).toMatchObject({ coachId: a._id });
  });
});

describe('coachClients.list view: summary (B3.3)', () => {
  it('leaves out the audit trail, archived terms and invite code — same rows, same authorization', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const other = await insertUser({ _id: 'coach-2', role: 'coach' });
    await (await getDb()).collection('coachClients').insertOne({
      _id: 'coach-1__c1', coachId: coach._id, clientId: 'c1', status: 'active', createdBy: coach._id, createdAt: 1, updatedAt: 1, inviteCode: 'ABC123',
      subscription: { status: 'active', startAt: 1, endAt: 9e12, updatedAt: 1 },
      subscriptionHistory: [{ startAt: 0, endAt: 1, status: 'ended', endedAt: 1 }],
      subscriptionEvents: Array.from({ length: 200 }, (_, i) => ({ at: i, op: 'setPrice', actorRole: 'coach', before: null, after: { status: 'active' } })),
    } as never);
    const full = await caller(coach).coachClients.list({ coachId: coach._id });
    const summary = await caller(coach).coachClients.list({ coachId: coach._id, view: 'summary' });
    expect(full[0]).toHaveProperty('subscriptionEvents');
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ clientId: 'c1', status: 'active', subscription: { status: 'active' } });
    expect(summary[0]).not.toHaveProperty('subscriptionEvents');
    expect(summary[0]).not.toHaveProperty('subscriptionHistory');
    expect(summary[0]).not.toHaveProperty('inviteCode');
    expect(JSON.stringify(summary).length).toBeLessThan(JSON.stringify(full).length / 10);
    await expect(caller(other).coachClients.list({ coachId: coach._id, view: 'summary' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('outgoing transfer requests never name the current coach (CO-03, B3.3)', () => {
  it('create and the outgoing list omit fromCoachId; the current coach\'s incoming list keeps it', async () => {
    const owner = await insertUser({ _id: 'coach-owner', role: 'coach' });
    const asker = await insertUser({ _id: 'coach-asker', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(owner._id);
    await givePlan(asker._id);
    await caller(owner).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });

    const created = await caller(asker).transfers.create({ clientId: x._id, reason: 'Moving to my gym' });
    expect(created).not.toHaveProperty('fromCoachId');
    const outgoing = await caller(asker).transfers.list({ type: 'outgoing' });
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]).toMatchObject({ clientId: x._id, toCoachId: asker._id, status: 'pending', reason: 'Moving to my gym' });
    expect(outgoing[0]).not.toHaveProperty('fromCoachId');
    expect(JSON.stringify(outgoing)).not.toContain(owner._id);

    const incoming = await caller(owner).transfers.list({ type: 'incoming' });
    expect(incoming[0]).toMatchObject({ fromCoachId: owner._id, toCoachId: asker._id });
    // The requester can still cancel by id.
    await caller(asker).transfers.resolve({ id: `${asker._id}__${x._id}`, action: 'cancel' });
    expect((await caller(asker).transfers.list({ type: 'outgoing' }))[0]).toMatchObject({ status: 'cancelled' });
  });
});

describe('invites.revoke never overwrites a claim (B3.3)', () => {
  it('a claimed invite cannot be revoked (CONFLICT, status stays claimed); revoking twice is harmless', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    await givePlan(coach._id);
    const asCoach = caller(coach);
    const a = await asCoach.invites.create({});
    const b = await asCoach.invites.create({});
    const db = await getDb();
    await db.collection<{ _id: string; status: string }>('signupInvites').updateOne({ _id: a._id }, { $set: { status: 'claimed' } });
    await expect(asCoach.invites.revoke({ code: a._id })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await db.collection<{ _id: string; status: string }>('signupInvites').findOne({ _id: a._id }))?.status).toBe('claimed');
    await asCoach.invites.revoke({ code: b._id });
    await asCoach.invites.revoke({ code: b._id });
    expect((await db.collection<{ _id: string; status: string }>('signupInvites').findOne({ _id: b._id }))?.status).toBe('revoked');
  });
});
