import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';

/**
 * B3.9.1 — server integrity (owner-approved, 2026-10-22). Every race is exercised with REAL concurrent
 * requests (Promise.allSettled), not by reasoning about order:
 *  - one active coach per client (two coaches adding the same client at once);
 *  - releasing a client is concurrency-safe and idempotent (one slot freed; a transfer's new coach kept);
 *  - a coach sees and restores only the plan versions of their own stint (O-16);
 *  - B3-S09: a check-in / assessment is reviewed only once submitted; a subscription request is
 *    decided once, while pending, and only within the coach's own stint;
 *  - verified cross-account privacy fixes: no "who coaches this client" oracle, a former coach's
 *    incoming requests and decisions, claimed invites' contact details, admin-only banners.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b39_integrity';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const as = (u: AuthedUser) => appRouter.createCaller({ req: { headers: {} } as VercelRequest, res: { setHeader: () => undefined, appendHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const errOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
const db = () => getDb();
const slots = async (coachId: string) => (await (await db()).collection<{ _id: string; activeClientCount?: number }>('coachPlans').findOne({ _id: coachId }))?.activeClientCount ?? 0;
const activeRels = async (clientId: string) => (await db()).collection('coachClients').countDocuments({ clientId, status: 'active' });
const assignedCoach = async (clientId: string) => (await (await db()).collection<UserDoc>('users').findOne({ _id: clientId }))?.assignedCoachId ?? null;
const notifications = async (type: string) => (await db()).collection('notifications').countDocuments({ type });

describe('one active coach per client', () => {
  it('two coaches adding the same unassigned client at the same moment: exactly one wins; the loser keeps its slot', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    await insertUser({ _id: 'client-x' });
    const results = await Promise.allSettled([a, b].map((c) => as(c).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')!;
    expect((loser.reason as { code: string }).code).toBe('CONFLICT');
    expect(await activeRels('client-x')).toBe(1);
    const winner = (await (await db()).collection('coachClients').findOne({ clientId: 'client-x', status: 'active' }))!.coachId;
    expect(await assignedCoach('client-x')).toBe(winner);
    expect((await slots('coach-a')) + (await slots('coach-b'))).toBe(1);
  });

  it('a client who already has a coach cannot be added by another, and nothing is spent', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    await insertUser({ _id: 'client-x' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    expect(await errOf(as(b).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } }))).toMatchObject({ code: 'CONFLICT' });
    expect(await slots('coach-b')).toBe(0);
    expect(await activeRels('client-x')).toBe(1);
  });
});

describe('releasing a client — concurrency-safe and idempotent', () => {
  async function coached() {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    await insertUser({ _id: 'client-x' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    return a;
  }

  it('two releases at once end it once and free exactly one slot', async () => {
    const a = await coached();
    expect(await slots('coach-a')).toBe(1);
    const results = await Promise.allSettled([as(a).coachClients.end({ id: 'coach-a__client-x' }), as(a).coachClients.end({ id: 'coach-a__client-x' })]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true); // the second is an idempotent no-op
    expect(await slots('coach-a')).toBe(0);
    expect(await assignedCoach('client-x')).toBeNull();
    expect((await (await db()).collection('coachClients').findOne({ _id: 'coach-a__client-x' as never }))?.status).toBe('ended');
  });

  it('releasing again later changes nothing (no second slot freed)', async () => {
    const a = await coached();
    await insertUser({ _id: 'client-y' });
    await as(a).coachClients.assign({ clientId: 'client-y', subscription: { status: 'trial' } });
    await as(a).coachClients.end({ id: 'coach-a__client-x' });
    expect(await slots('coach-a')).toBe(1);
    await as(a).coachClients.end({ id: 'coach-a__client-x' });
    expect(await slots('coach-a')).toBe(1);
  });

  it('a release that loses to a transfer is refused and never clears the new coach', async () => {
    const a = await coached();
    await insertUser({ _id: 'coach-b', role: 'coach' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    await as(sup).coachClients.transfer({ id: 'coach-a__client-x', toCoachId: 'coach-b', mode: 'keep_plans', subscriptionHandling: 'keep' });
    expect(await errOf(as(a).coachClients.end({ id: 'coach-a__client-x' }))).toMatchObject({ code: 'CONFLICT' });
    expect(await assignedCoach('client-x')).toBe('coach-b');
    expect(await slots('coach-a')).toBe(0);
    expect(await slots('coach-b')).toBe(1);
  });
});

describe('plan history belongs to the stint (O-16)', () => {
  it('after a transfer the new coach neither lists nor restores the previous coach’s versions; their own are kept; client and admin see all', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const client = await insertUser({ _id: 'client-x' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    const versions = (await db()).collection('planVersions');
    const t0 = Date.now() - 5 * DAY;
    await versions.insertOne({ _id: 'v-a1' as never, clientId: 'client-x', kind: 'workout', versionNumber: 1, name: 'A plan', createdAt: t0, createdBy: 'coach-a', reason: 'A private reason', snapshot: { name: 'A plan', days: [] }, active: false });
    await as(sup).coachClients.transfer({ id: 'coach-a__client-x', toCoachId: 'coach-b', mode: 'fresh_start', subscriptionHandling: 'keep' });
    await versions.insertOne({ _id: 'v-b1' as never, clientId: 'client-x', kind: 'workout', versionNumber: 2, name: 'B plan', createdAt: Date.now() + 1000, createdBy: 'coach-b', snapshot: { name: 'B plan', days: [] }, active: true });
    const listedByB = await as(b).planVersions.list({ clientId: 'client-x' });
    expect(listedByB.map((v) => v._id)).toEqual(['v-b1']);
    expect(await errOf(as(b).planVersions.restore({ clientId: 'client-x', versionId: 'v-a1' }))).toMatchObject({ code: 'NOT_FOUND' });
    await expect(as(b).planVersions.restore({ clientId: 'client-x', versionId: 'v-b1' })).resolves.toBeTruthy();
    expect((await as(client).planVersions.list({})).map((v) => v._id).sort()).toEqual(['v-a1', 'v-b1']);
    expect((await as(sup).planVersions.list({ clientId: 'client-x' })).length).toBe(2);
  });
});

describe('B3-S09 — reviews and decisions only in the right state, once', () => {
  async function pair() {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const x = await insertUser({ _id: 'client-x' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    return { a, x };
  }
  const W = '2026-10-17';
  const W_END = '2026-10-23';

  it('a check-in still waiting for the client cannot be reviewed — the client can still answer it', async () => {
    const { a, x } = await pair();
    await as(a).checkIns.request({ clientId: 'client-x', weekStart: W, weekEnd: W_END });
    expect(await errOf(as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Great' }))).toEqual({ code: 'CONFLICT', reason: 'CHECKIN_NOT_SUBMITTED' });
    await expect(as(x).checkIns.submit({ clientId: 'client-x', weekStart: W, currentWeight: 70 } as never)).resolves.toBeTruthy();
    await expect(as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Great' })).resolves.toMatchObject({ status: 'reviewed', coachFeedback: 'Great' });
  });

  it('two reviews at once notify the client once; the same feedback again writes nothing; edited feedback is saved and announced', async () => {
    const { a, x } = await pair();
    await as(a).checkIns.request({ clientId: 'client-x', weekStart: W, weekEnd: W_END });
    await as(x).checkIns.submit({ clientId: 'client-x', weekStart: W, currentWeight: 70 } as never);
    await Promise.all([as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Good week' }), as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Good week' })]);
    expect(await notifications('checkin_reviewed')).toBe(1);
    await as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Good week' });
    expect(await notifications('checkin_reviewed')).toBe(1);
    await expect(as(a).checkIns.review({ clientId: 'client-x', weekStart: W, feedback: 'Good week — keep the deficit' })).resolves.toMatchObject({ coachFeedback: 'Good week — keep the deficit' });
    expect(await notifications('checkin_reviewed')).toBe(2);
  });

  it('an answered check-in is never deleted; an open request can be withdrawn', async () => {
    const { a, x } = await pair();
    await as(a).checkIns.request({ clientId: 'client-x', weekStart: W, weekEnd: W_END });
    await as(x).checkIns.submit({ clientId: 'client-x', weekStart: W, currentWeight: 70 } as never);
    expect(await errOf(as(a).checkIns.delete({ clientId: 'client-x', weekStart: W }))).toEqual({ code: 'CONFLICT', reason: 'CHECKIN_ANSWERED' });
    expect(await (await db()).collection('checkIns').countDocuments({ clientId: 'client-x' })).toBe(1);
    await as(a).checkIns.request({ clientId: 'client-x', weekStart: '2026-10-24', weekEnd: '2026-10-30' });
    await expect(as(a).checkIns.delete({ clientId: 'client-x', weekStart: '2026-10-24' })).resolves.toBeUndefined();
    expect(await (await db()).collection('checkIns').countDocuments({ clientId: 'client-x' })).toBe(1);
  });

  it('an assessment is reviewed only once submitted (never created by a review); a draft never undoes a review; a resubmission is "updated after review"', async () => {
    const { a, x } = await pair();
    expect(await errOf(as(a).assessment.review({ clientId: 'client-x' }))).toEqual({ code: 'CONFLICT', reason: 'ASSESSMENT_NOT_SUBMITTED' });
    expect(await (await db()).collection('clientProfiles').countDocuments({ _id: 'client-x' as never })).toBe(0); // no upsert
    await as(x).assessment.saveDraft({ goals: { primary: 'strength' } } as never);
    expect(await errOf(as(a).assessment.review({ clientId: 'client-x' }))).toEqual({ code: 'CONFLICT', reason: 'ASSESSMENT_NOT_SUBMITTED' });
    const assessment = { basic: { fullName: 'Client X' }, goals: {}, lifestyle: {}, training: {}, health: {}, nutrition: {}, motivation: {}, progressPhotos: {} };
    await as(x).assessment.submit({ assessment } as never);
    await expect(as(a).assessment.review({ clientId: 'client-x' })).resolves.toMatchObject({ status: 'reviewed' });
    expect(await notifications('assessment_reviewed')).toBe(1);
    await as(a).assessment.review({ clientId: 'client-x' }); // already reviewed: nothing
    expect(await notifications('assessment_reviewed')).toBe(1);
    await as(x).assessment.saveDraft({ goals: { primary: 'endurance' } } as never);
    const status = async () => (await (await db()).collection<{ assessment?: { status?: string } }>('clientProfiles').findOne({ _id: 'client-x' as never }))?.assessment?.status;
    expect(await status()).toBe('reviewed');
    await as(x).assessment.submit({ assessment } as never);
    expect(await status()).toBe('updated_after_review');
    await as(a).assessment.review({ clientId: 'client-x' });
    expect(await status()).toBe('reviewed');
  });

  it('a subscription request is decided once, only while pending, never created, and never from a previous stint', async () => {
    const { a, x } = await pair();
    expect(await errOf(as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'accepted', coachNote: 'ok' }))).toMatchObject({ code: 'NOT_FOUND' });
    expect(await (await db()).collection('subscriptionRequests').countDocuments({})).toBe(0);
    await as(x).subscriptionRequest.submit({ reason: 'Travelling' });
    await as(x).subscriptionRequest.cancel();
    expect(await errOf(as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'accepted', coachNote: 'ok' }))).toEqual({ code: 'CONFLICT', reason: 'REQUEST_ALREADY_RESOLVED' });
    await as(x).subscriptionRequest.submit({ reason: 'Travelling again' });
    const both = await Promise.allSettled([as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'accepted', coachNote: 'ok' }), as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'rejected', coachNote: 'no' })]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await notifications('freeze_decided')).toBe(1);
    expect(await errOf(as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'accepted', coachNote: 'x'.repeat(501) }))).toMatchObject({ code: 'BAD_REQUEST' });
    // A request filed under the previous coach is not the new coach's to decide.
    await (await db()).collection('subscriptionRequests').updateOne({ _id: 'client-x' as never }, { $set: { status: 'pending', requestedAt: Date.now() - 10 * DAY } });
    await (await db()).collection('coachClients').updateOne({ _id: 'coach-a__client-x' as never }, { $set: { createdAt: Date.now() - DAY } });
    expect(await errOf(as(a).subscriptionRequest.decide({ clientId: 'client-x', outcome: 'accepted', coachNote: 'ok' }))).toEqual({ code: 'CONFLICT', reason: 'REQUEST_ALREADY_RESOLVED' });
  });
});

describe('cross-account privacy (verified audit findings)', () => {
  it('transfers.create never confirms who coaches a client: a coach-supplied fromCoachId is ignored', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const c = await insertUser({ _id: 'coach-c', role: 'coach' });
    await insertUser({ _id: 'client-x' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    // Guessing the wrong coach and guessing the right one answer the same way (both file the request).
    await expect(as(b).transfers.create({ clientId: 'client-x', fromCoachId: 'coach-c', reason: 'guess' })).resolves.not.toHaveProperty('fromCoachId');
    await expect(as(c).transfers.create({ clientId: 'client-x', fromCoachId: 'coach-a', reason: 'guess' })).resolves.not.toHaveProperty('fromCoachId');
    const stored = await (await db()).collection('transferRequests').find({}).toArray();
    expect(stored.map((r) => r.fromCoachId)).toEqual(['coach-a', 'coach-a']);
  });

  it('after a release the former coach no longer sees or decides requests about that client', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    await insertUser({ _id: 'client-x' });
    await as(a).coachClients.assign({ clientId: 'client-x', subscription: { status: 'trial' } });
    await as(b).transfers.create({ clientId: 'client-x', reason: 'Closer to home' });
    expect(await as(a).transfers.list({ type: 'incoming' })).toHaveLength(1);
    await as(a).coachClients.end({ id: 'coach-a__client-x' });
    expect(await as(a).transfers.list({ type: 'incoming' })).toEqual([]);
    expect(await errOf(as(a).transfers.resolve({ id: 'coach-b__client-x', action: 'reject' }))).toMatchObject({ code: 'CONFLICT' });
  });

  it('a coach’s claimed invites keep no client contact details; pending invites are unchanged; admins keep them', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const sup = await insertUser({ _id: 'sa', role: 'super_admin' });
    const pending = await as(a).invites.create({ email: 'later@t.test', phone: '+20111' });
    await (await db()).collection('signupInvites').insertOne({ _id: 'CLAIMED1' as never, coachId: 'coach-a', status: 'claimed', email: 'client@t.test', phone: '+20122', claimedByUid: 'client-z', createdAt: Date.now(), claimedAt: Date.now(), expiresAt: null });
    const all = await as(a).invites.list({ status: 'all' });
    const claimed = all.find((i) => i._id === 'CLAIMED1') as Record<string, unknown>;
    expect(claimed.email).toBeUndefined();
    expect(claimed.phone).toBeUndefined();
    expect((await as(a).invites.list({ status: 'pending' }))[0]).toMatchObject({ _id: pending._id, email: 'later@t.test' });
    expect((await as(sup).invites.list({ status: 'all', coachId: 'coach-a' })).find((i) => i._id === 'CLAIMED1')).toMatchObject({ email: 'client@t.test' });
  });

  it('the full banner list (scheduled, admin-targeted, with authors) is admin-only; viewers read their own', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const admin = await insertUser({ _id: 'admin-1', role: 'admin' });
    expect(await errOf(as(a).banners.list())).toMatchObject({ code: 'FORBIDDEN' });
    await expect(as(admin).banners.list()).resolves.toEqual([]);
    await expect(as(a).banners.forViewer({})).resolves.toBeTruthy();
  });
});

describe('PF-14 — bounded reads keep their answers', () => {
  it('coach check-in overview: with months of check-ins, the latest and the previous answered one are still found; another coach\'s are never candidates', async () => {
    const coach = await insertUser({ _id: 'pf-coach', role: 'coach' });
    await insertUser({ _id: 'pf-other', role: 'coach' });
    await insertUser({ _id: 'pf-client', role: 'client', assignedCoachId: 'pf-coach' });
    const d = await db();
    const start = Date.now() - 400 * DAY;
    await d.collection('coachClients').insertOne({ _id: 'pf-rel', coachId: 'pf-coach', clientId: 'pf-client', status: 'active', createdAt: start, updatedAt: start } as never);
    const week = (i: number) => new Date(Date.UTC(2025, 0, 4) + i * 7 * DAY).toISOString().slice(0, 10);
    // 40 weekly records: the newest is still "requested"; the one before it was answered.
    const rows = Array.from({ length: 40 }, (_, i) => ({
      _id: `pf-client__${week(i)}`,
      clientId: 'pf-client',
      coachId: 'pf-coach',
      weekStart: week(i),
      weekEnd: week(i),
      status: i === 39 ? 'requested' : i === 38 ? 'submitted' : 'reviewed',
      createdAt: start + i * 7 * DAY,
      updatedAt: start + i * 7 * DAY,
    }));
    // A newer record that belongs to another coach — never this coach's latest.
    rows.push({ _id: `pf-client__${week(41)}__pf-other`, clientId: 'pf-client', coachId: 'pf-other', weekStart: week(41), weekEnd: week(41), status: 'submitted', createdAt: start + 41 * 7 * DAY, updatedAt: start + 41 * 7 * DAY });
    await d.collection('checkIns').insertMany(rows as never[]);
    const [summary] = await as(coach).checkIns.listForCoachClients({});
    expect(summary.clientId).toBe('pf-client');
    expect(summary.latest?.weekStart).toBe(week(39));
    expect(summary.previous?.weekStart).toBe(week(38));
  });

  it('coach directory: the last workout is the newest date even when it is months old (not "never")', async () => {
    const coach = await insertUser({ _id: 'pf-coach2', role: 'coach' });
    await insertUser({ _id: 'pf-client2', role: 'client', assignedCoachId: 'pf-coach2' });
    const d = await db();
    await d.collection('coachClients').insertOne({ _id: 'pf-rel2', coachId: 'pf-coach2', clientId: 'pf-client2', status: 'active', createdAt: Date.now() - 300 * DAY, updatedAt: Date.now() } as never);
    const day = (ago: number) => new Date(Date.now() - ago * DAY).toISOString().slice(0, 10);
    await d.collection('syncRecords').insertMany([
      { _id: 'pf-w1', clientId: 'pf-client2', collection: 'workoutLogs', data: { date: day(120), finished: true }, syncedAt: Date.now() },
      { _id: 'pf-w2', clientId: 'pf-client2', collection: 'workoutLogs', data: { date: day(200), finished: true }, syncedAt: Date.now() },
      { _id: 'pf-w3', clientId: 'pf-client2', collection: 'workoutLogs', data: { date: day(1), finished: false }, syncedAt: Date.now() },
    ] as never[]);
    const [row] = await as(coach).coachClients.dashboardSummaries({});
    expect(row).toMatchObject({ clientId: 'pf-client2', workouts7d: 0, lastActivity: day(120) });
  });
});
