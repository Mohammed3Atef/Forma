import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

/**
 * B3.4 owner review (2026-10-18):
 *  1. Two client generations against one check-in API. Older apps (RC2 … B3.3) address a WEEK;
 *     this release names records by KEY (`byKey`). Same-week records of different coaches must
 *     never be confused — reads, submissions, retries — and a submission is never redirected.
 *  2. Archived relationship stints: a coach keeps their own commercial history; other coaches get
 *     timeline facts only; history never opens the client's live workspace; admins keep full access.
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
async function givePlan(coachId: string) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').insertOne({ _id: coachId, plan: 'trial', status: 'active', maxClients: 10, activeClientCount: 0, startedAt: now, endsAt: null, createdAt: now, updatedAt: now });
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string; message?: string }) => (e.message?.startsWith('CHECKIN_') ? e.message : e.code ?? 'ERR'));
const W = '2026-10-17';
const W_END = '2026-10-23';
const rec = async (id: string) => (await getDb()).collection<Record<string, unknown>>('checkIns').findOne({ _id: id } as never);

async function people() {
  const a = await insertUser({ _id: 'coach-a', role: 'coach' });
  const b = await insertUser({ _id: 'coach-b', role: 'coach' });
  const x = await insertUser({ _id: 'client-x', role: 'client' });
  await givePlan(a._id);
  await givePlan(b._id);
  await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
  return { a, b, x };
}
async function handOver(a: UserDoc, b: UserDoc, x: UserDoc) {
  await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
  await tick();
  await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
}

describe('same-week records of two coaches: this release (byKey) and older apps (by week)', () => {
  it('the common hand-over: A\'s week done, B asks again — both generations reach the right record, retries are idempotent', async () => {
    const { a, b, x } = await people();
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    await caller(x).checkIns.submit({ weekStart: W, notes: 'For A', byKey: true });
    await caller(a).checkIns.review({ clientId: x._id, weekStart: W, feedback: 'A: well done' });
    await handOver(a, b, x);
    await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    const aKey = `${x._id}__${W}`;
    const bKey = `${x._id}__${W}__${b._id}`;

    // This release: both records, each by its own key.
    expect((await caller(x).checkIns.list({ byKey: true })).map((d) => d._id)).toEqual([bKey, aKey]);
    expect(await caller(x).checkIns.get({ weekStart: W, byKey: true })).toMatchObject({ _id: aKey, coachFeedback: 'A: well done' });
    expect(await caller(x).checkIns.get({ weekStart: `${W}__${b._id}`, byKey: true })).toMatchObject({ _id: bKey, status: 'requested' });

    // An older app keys by week: one row for W — the actionable one (B's), and opening W opens it too.
    expect((await caller(x).checkIns.list({})).map((d) => d._id)).toEqual([bKey]);
    expect(await caller(x).checkIns.get({ weekStart: W })).toMatchObject({ _id: bKey });
    // Its submission by week goes to the week's only open request (B's); a replay returns it; A's is untouched.
    await caller(x).checkIns.submit({ weekStart: W, currentWeight: 70, opId: 'old-op-1' });
    expect(await caller(x).checkIns.submit({ weekStart: W, currentWeight: 70, opId: 'old-op-1' })).toMatchObject({ _id: bKey, submitOpId: 'old-op-1' });
    expect(await rec(bKey)).toMatchObject({ status: 'submitted', currentWeight: 70 });
    expect(await rec(aKey)).toMatchObject({ status: 'reviewed', notes: 'For A' });
    // RC2 sends no opId: a second submission of the same week is refused, as it always was.
    expect(await code(caller(x).checkIns.submit({ weekStart: W, currentWeight: 71 }))).toBe('FORBIDDEN');
    // A submission by key (this release) to A's done week is refused; B's is now done too.
    expect(await code(caller(x).checkIns.submit({ weekStart: W, byKey: true }))).toBe('FORBIDDEN');
  });

  it('two open requests in one week (A\'s left open, B\'s new): an older app\'s submission by week is refused, never redirected; B\'s notification link works for both generations', async () => {
    const { a, b, x } = await people();
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    await handOver(a, b, x);
    await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    const aKey = `${x._id}__${W}`;
    const bKey = `${x._id}__${W}__${b._id}`;

    // Neither generation lists A's open request (nobody can answer it now).
    expect((await caller(x).checkIns.list({ byKey: true })).map((d) => d._id)).toEqual([bKey]);
    expect((await caller(x).checkIns.list({})).map((d) => d._id)).toEqual([bKey]);
    expect(await caller(x).checkIns.get({ weekStart: W })).toMatchObject({ _id: bKey });
    // By week alone the answers could be meant for either request: refused, both records untouched.
    expect(await code(caller(x).checkIns.submit({ weekStart: W, notes: 'Which one?', opId: 'old-op-2' }))).toBe('CHECKIN_AMBIGUOUS');
    expect(await rec(aKey)).toMatchObject({ status: 'requested' });
    expect(await rec(bKey)).toMatchObject({ status: 'requested' });
    // B's notification carries the key — an older app opens and submits that exact record.
    const notice = await (await getDb()).collection<Record<string, unknown>>('notifications').findOne({ clientId: x._id, type: 'checkin_requested', entityId: `${W}__${b._id}` });
    expect(notice).toMatchObject({ route: `/check-in/${W}__${b._id}` });
    expect(await caller(x).checkIns.get({ weekStart: `${W}__${b._id}` })).toMatchObject({ _id: bKey });
    await caller(x).checkIns.submit({ weekStart: `${W}__${b._id}`, notes: 'For B', opId: 'old-op-3' });
    expect(await rec(bKey)).toMatchObject({ status: 'submitted', notes: 'For B' });
    // Submitting B's record resolves B's request notification only — never the other record's.
    const requests = await (await getDb()).collection<Record<string, unknown>>('notifications').find({ clientId: x._id, type: 'checkin_requested' }).toArray();
    expect(Object.fromEntries(requests.map((n) => [n.entityId, n.resolvedAt != null]))).toEqual({ [W]: false, [`${W}__${b._id}`]: true });
    // A queued answer for A's request (composed before the hand-over) is refused — never written into A's
    // record nobody will read, never into B's — and stays on the device.
    expect(await code(caller(x).checkIns.submit({ weekStart: W, notes: 'Queued for A', opId: 'old-op-4' }))).toBe('CHECKIN_STALE');
    expect(await code(caller(x).checkIns.submit({ weekStart: W, notes: 'Deep link to A', byKey: true }))).toBe('CHECKIN_STALE');
    expect(await rec(aKey)).toMatchObject({ status: 'requested' });
    expect(await rec(aKey)).not.toHaveProperty('notes');
    // A's old notification link opens A's record as CLOSED in this release (not a wizard that can't be sent),
    // and the refusal carries a stable reason the app can act on.
    expect(await caller(x).checkIns.get({ weekStart: W, byKey: true })).toMatchObject({ _id: aKey, closed: true });
    expect(await caller(x).checkIns.get({ weekStart: `${W}__${b._id}`, byKey: true })).not.toHaveProperty('closed');
    const refusal = await caller(x).checkIns.submit({ weekStart: W, notes: 'x', byKey: true }).catch((e: { cause?: { reason?: string } }) => e);
    expect((refusal as { cause?: { reason?: string } }).cause?.reason).toBe('CHECKIN_STALE');
    // The retry of B's delivered submission still returns B's record.
    expect(await caller(x).checkIns.submit({ weekStart: `${W}__${b._id}`, notes: 'For B', opId: 'old-op-3' })).toMatchObject({ _id: bKey });
  });

  it('answers queued offline for A\'s request and delivered after the hand-over (before B asks) are refused, not dropped into a record no coach reads', async () => {
    const { a, b, x } = await people();
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    await handOver(a, b, x);
    expect(await code(caller(x).checkIns.submit({ weekStart: W, notes: 'Written while A coached', opId: 'old-op-5' }))).toBe('CHECKIN_STALE');
    expect(await rec(`${x._id}__${W}`)).toMatchObject({ status: 'requested' });
  });

  it('no hand-over: both generations behave exactly as before (one record per week, by week or by key)', async () => {
    const { a, x } = await people();
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    expect((await caller(x).checkIns.list({})).map((d) => d._id)).toEqual([`${x._id}__${W}`]);
    expect(await caller(x).checkIns.get({ weekStart: W })).toMatchObject({ status: 'requested' });
    await caller(x).checkIns.submit({ weekStart: W, notes: 'Old app', opId: 'op-6' });
    expect(await caller(x).checkIns.submit({ weekStart: W, notes: 'Old app', opId: 'op-6' })).toMatchObject({ submitOpId: 'op-6' });
    expect(await code(caller(x).checkIns.submit({ weekStart: W, byKey: true }))).toBe('FORBIDDEN');
    expect(await caller(x).checkIns.get({ weekStart: W, byKey: true })).toMatchObject({ status: 'submitted', notes: 'Old app' });
  });
});

describe('archived relationship stints: own history yes, others\' facts only, never the live workspace', () => {
  async function history() {
    const { a, b, x } = await people();
    await caller(a).coachClients.updateSubscription({ id: `${a._id}__${x._id}`, sub: { op: 'correct', price: 1500, currency: 'EGP' } } as never);
    await caller(a).coachNotes.create({ clientId: x._id, body: 'A private note', visibility: 'private' } as never);
    // The client's assessment (theirs, readable by their coach) with A's private review note on it.
    await (await getDb()).collection<{ _id: string } & Record<string, unknown>>('clientProfiles').updateOne({ _id: x._id }, { $set: { clientId: x._id, assessment: { status: 'submitted', submittedAt: Date.now(), goal: 'Run a 10k' } } }, { upsert: true });
    await caller(a).assessment.setCoachNotes({ clientId: x._id, coachNotes: 'A assessment note' });
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    await caller(x).checkIns.submit({ weekStart: W, notes: 'For A only', byKey: true });
    // A → B (transfer), B → A (transfer back), then A releases: A has an archived stint and an ended one.
    await caller(b).transfers.create({ clientId: x._id, reason: 'Moving', mode: 'keep_plans' });
    await caller(a).transfers.resolve({ id: `${b._id}__${x._id}`, action: 'accept' });
    await tick();
    await caller(a).transfers.create({ clientId: x._id, reason: 'Back', mode: 'keep_plans' });
    await caller(b).transfers.resolve({ id: `${a._id}__${x._id}`, action: 'accept' });
    await tick();
    return { a, b, x };
  }

  it('the active coach reads their own relationship with its archived stints in full; another coach\'s only as dates and how it ended', async () => {
    const { a, b, x } = await history();
    const own = await caller(a).coachClients.get({ id: `${a._id}__${x._id}` });
    expect(own.previousStints?.[0]).toMatchObject({ status: 'ended', endReason: 'transferred' });
    expect(JSON.stringify(own.previousStints)).toContain('1500');
    const asA = await caller(a).coachClients.list({ clientId: x._id });
    const bs = asA.find((r) => r.coachId === b._id)!;
    expect(Object.keys(bs).sort()).toEqual(['_id', 'clientId', 'coachId', 'createdAt', 'endReason', 'endedAt', 'mode', 'status', 'updatedAt'].sort());
    // B (now former) can't open A's relationship document at all.
    expect(await code(caller(b).coachClients.get({ id: `${a._id}__${x._id}` }))).toBe('FORBIDDEN');
  });

  it('a former coach keeps their own commercial records, but history never opens the client\'s live data', async () => {
    const { a, b, x } = await history();
    // B ended (transferred back): B's own record (its price history) stays readable to B.
    expect(await caller(b).coachClients.get({ id: `${b._id}__${x._id}` })).toMatchObject({ status: 'ended' });
    const asB = await caller(b).coachClients.list({ clientId: x._id });
    expect(asB.map((r) => r.coachId)).toEqual([b._id]);
    expect(JSON.stringify(asB)).not.toContain('1500');
    // The live workspace is closed to B: profile, logs, plans, notes, check-ins, assessment.
    for (const call of [
      () => caller(b).profile.get({ clientId: x._id } as never),
      () => caller(b).logsWorkout.list({ clientId: x._id }),
      () => caller(b).workoutPlan.get({ clientId: x._id } as never),
      () => caller(b).coachNotes.list({ clientId: x._id }),
      () => caller(b).checkIns.list({ clientId: x._id }),
      () => caller(b).assessment.get({ clientId: x._id } as never),
    ]) expect(await code(call())).toBe('FORBIDDEN');
    // After A releases, A is a former coach too: own records only, no live data.
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    expect((await caller(a).coachClients.list({ clientId: x._id })).map((r) => r.coachId)).toEqual([a._id]);
    expect(await code(caller(a).checkIns.list({ clientId: x._id }))).toBe('FORBIDDEN');
  });

  it('a third coach taking the client on gets no previous coach\'s prices, notes, check-ins or private assessment content', async () => {
    const { a, x } = await history();
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    const c = await insertUser({ _id: 'coach-c', role: 'coach' });
    await givePlan(c._id);
    await caller(c).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    const seen = JSON.stringify([
      await caller(c).coachClients.list({ clientId: x._id }),
      await caller(c).coachNotes.list({ clientId: x._id }),
      await caller(c).checkIns.list({ clientId: x._id }),
      await caller(c).checkIns.listForCoachClients({}),
      await caller(c).assessment.get({ clientId: x._id }),
    ]);
    expect(seen).toContain('Run a 10k'); // the client's own assessment answers are the new coach's to read
    expect(seen).not.toMatch(/1500|A private note|A assessment note|For A only|subscriptionEvents|subscriptionHistory|inviteCode/);
  });

  it('an unrelated coach gets nothing; a suspended active coach keeps read-only access to their own records; an admin reads everything', async () => {
    const { a, x } = await history();
    const z = await insertUser({ _id: 'coach-z', role: 'coach' });
    expect(await code(caller(z).coachClients.list({ clientId: x._id }))).toBe('FORBIDDEN');
    expect(await code(caller(z).coachClients.get({ id: `${a._id}__${x._id}` }))).toBe('FORBIDDEN');
    const suspended = { ...a, accountStatus: 'suspended' as const };
    expect(await caller(suspended).coachClients.get({ id: `${a._id}__${x._id}` })).toMatchObject({ status: 'active' });
    expect(await code(caller(suspended).coachClients.updateSubscription({ id: `${a._id}__${x._id}`, sub: { op: 'correct', price: 1, currency: 'EGP' } } as never))).toBe('FORBIDDEN');
    const admin = await insertUser({ _id: 'admin-1', role: 'super_admin' });
    const all = await caller(admin).coachClients.list({ clientId: x._id });
    expect(all.find((r) => r.coachId === a._id)?.previousStints?.[0]).toHaveProperty('subscription');
  });
});
