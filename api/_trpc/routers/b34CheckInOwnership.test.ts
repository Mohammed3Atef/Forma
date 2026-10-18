import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachPlanDoc } from '../../coach-plans/_data.js';

/**
 * B3.4 (owner decisions 2026-10-18):
 *  - a new coach must NOT see check-ins owned by a previous coach — on every read path (get, list,
 *    review, delete, the batched summaries), server-side; the client keeps their own history;
 *  - after a mid-week hand-over the incoming coach may request the same training week as a NEW
 *    record of their own — the previous coach's record is never reassigned, exposed or touched;
 *    no duplicates (also under concurrency); legacy records are never given an owner they don't have;
 *  - B3-S13: a re-activated relationship starts clean, the previous stint archived explicitly.
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
const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e: { code?: string }) => e.code ?? 'ERR');
const W = '2026-10-17';
const W_END = '2026-10-23';

/** Coach A coaches X and asks for week W; X moves to coach B mid-week through a real transfer (A approves B's request). */
async function handOver() {
  const a = await insertUser({ _id: 'coach-a', role: 'coach' });
  const b = await insertUser({ _id: 'coach-b', role: 'coach' });
  const x = await insertUser({ _id: 'client-x', role: 'client' });
  const admin = await insertUser({ _id: 'admin-1', role: 'super_admin' });
  await givePlan(a._id);
  await givePlan(b._id);
  await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
  await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
  await tick();
  await caller(b).transfers.create({ clientId: x._id, reason: 'Moving gyms', mode: 'keep_plans' });
  await caller(a).transfers.resolve({ id: `${b._id}__${x._id}`, action: 'accept' });
  await tick();
  return { a, b, x, admin };
}
const docs = async (filter: object) => (await getDb()).collection<Record<string, unknown>>('checkIns').find(filter).toArray();

describe('mid-week hand-over: the incoming coach requests the same week as a record of their own', () => {
  it('B gets a distinct record; A\'s is untouched; neither coach can read or change the other\'s', async () => {
    const { a, b, x } = await handOver();
    const before = (await docs({ _id: `${x._id}__${W}` }))[0];
    expect(before).toMatchObject({ coachId: a._id, status: 'requested' });

    const mine = await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    expect(mine).toMatchObject({ _id: `${x._id}__${W}__${b._id}`, coachId: b._id, weekStart: W, status: 'requested' });
    // A's record: same document, byte for byte.
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).toEqual(before);

    // B reads only B's: by week, by A's key, in the list — never A's record.
    expect(await caller(b).checkIns.get({ clientId: x._id, weekStart: W })).toMatchObject({ _id: mine._id });
    expect(await caller(b).checkIns.get({ clientId: x._id, weekStart: `${W}__${a._id}` })).toMatchObject({ _id: mine._id });
    expect((await caller(b).checkIns.list({ clientId: x._id })).map((d) => d._id)).toEqual([mine._id]);
    // B cannot review or delete A's record: the week resolves to B's own.
    await caller(x).checkIns.submit({ weekStart: `${W}__${b._id}`, notes: 'For B' });
    await caller(b).checkIns.review({ clientId: x._id, weekStart: W, feedback: 'Thanks' });
    expect((await docs({ _id: mine._id }))[0]).toMatchObject({ status: 'reviewed', coachFeedback: 'Thanks' });
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).toEqual(before);
    await caller(b).checkIns.delete({ clientId: x._id, weekStart: W });
    expect(await docs({ _id: mine._id })).toHaveLength(0);
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).toEqual(before);

    // A no longer coaches X: nothing at all.
    expect(await code(caller(a).checkIns.get({ clientId: x._id, weekStart: W }))).toBe('FORBIDDEN');
    expect(await code(caller(a).checkIns.list({ clientId: x._id }))).toBe('FORBIDDEN');
    expect(await code(caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END }))).toBe('FORBIDDEN');
  });

  it('repeated and concurrent requests by the incoming coach make exactly one record', async () => {
    const { b, x } = await handOver();
    const all = await Promise.all(Array.from({ length: 6 }, () => caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END })));
    expect(new Set(all.map((d) => d._id))).toEqual(new Set([`${x._id}__${W}__${b._id}`]));
    expect(await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END })).toMatchObject({ _id: `${x._id}__${W}__${b._id}` });
    expect(await docs({ clientId: x._id, weekStart: W })).toHaveLength(2);
  });

  it('a first-time week is still one plain record, and concurrent first requests never duplicate it', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    const all = await Promise.all(Array.from({ length: 6 }, () => caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END })));
    expect(new Set(all.map((d) => d._id))).toEqual(new Set([`${x._id}__${W}`]));
    expect(await docs({ clientId: x._id })).toHaveLength(1);
  });

  it('the client sees one actionable request — the current coach\'s — and the old one stays intact', async () => {
    const { a, b, x } = await handOver();
    await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    const list = await caller(x).checkIns.list({ byKey: true });
    expect(list.filter((d) => d.status === 'requested').map((d) => d._id)).toEqual([`${x._id}__${W}__${b._id}`]);
    // An app that addresses the week alone is shown B's request, not A's stale one…
    expect(await caller(x).checkIns.get({ weekStart: W })).toMatchObject({ coachId: b._id });
    // …but with A's request still open its submission by week could mean either — refused (b34CompatPrivacy.test.ts).
    // This release submits by key; a replay of the same submission is idempotent (B1.6), still on B's record.
    await caller(x).checkIns.submit({ weekStart: `${W}__${b._id}`, currentWeight: 70, opId: 'op-1', byKey: true });
    await caller(x).checkIns.submit({ weekStart: `${W}__${b._id}`, currentWeight: 70, opId: 'op-1', byKey: true });
    expect((await docs({ _id: `${x._id}__${W}__${b._id}` }))[0]).toMatchObject({ status: 'submitted', currentWeight: 70, submitOpId: 'op-1' });
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).toMatchObject({ coachId: a._id, status: 'requested' });
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).not.toHaveProperty('currentWeight');
    // The coach-bound notice went to B, about B's record.
    const notes = await (await getDb()).collection<Record<string, unknown>>('notifications').find({ clientId: x._id, forRole: 'coach', type: 'checkin_submitted' }).toArray();
    expect(notes.map((n) => [n.coachId, n.entityId])).toEqual([[b._id, `${W}__${b._id}`]]);
    // B's request notice deep-links to B's record.
    const req = await (await getDb()).collection<Record<string, unknown>>('notifications').findOne({ clientId: x._id, forRole: 'client', type: 'checkin_requested', entityId: `${W}__${b._id}` });
    expect(req).toMatchObject({ route: `/check-in/${W}__${b._id}` });
  });

  it('history survives: A\'s submitted week stays the client\'s; B never sees it; A returning never sees B\'s', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await givePlan(b._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    await caller(x).checkIns.submit({ weekStart: W, notes: 'For coach A', progressPhotos: { front: 'https://cdn.example/a-front.jpg' } });
    await caller(a).checkIns.review({ clientId: x._id, weekStart: W, feedback: 'A says well done' });
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    const bW = await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });

    // Nothing of A's — answers, photos, feedback — reaches B by any path.
    const forB = JSON.stringify([await caller(b).checkIns.list({ clientId: x._id }), await caller(b).checkIns.get({ clientId: x._id, weekStart: W }), await caller(b).checkIns.listForCoachClients({})]);
    expect(forB).not.toMatch(/For coach A|a-front|A says well done/);
    // The client keeps both: their reviewed week with A, and B's open request — each by its own key.
    const mine = await caller(x).checkIns.list({ byKey: true });
    expect(mine.map((d) => [d._id, d.status])).toEqual([[bW._id, 'requested'], [`${x._id}__${W}`, 'reviewed']]);
    expect(await caller(x).checkIns.get({ weekStart: W, byKey: true })).toMatchObject({ coachFeedback: 'A says well done' });
    expect(await caller(x).checkIns.get({ weekStart: `${W}__${b._id}`, byKey: true })).toMatchObject({ coachId: b._id });

    // X returns to A: A sees A's own week again — never B's.
    await caller(b).coachClients.end({ id: `${b._id}__${x._id}`, reason: 'released' });
    await tick();
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    const forA = await caller(a).checkIns.list({ clientId: x._id });
    expect(forA.map((d) => d._id)).toEqual([`${x._id}__${W}`]);
  });

  it('legacy records (no coachId) are never given an owner: before the relationship → not the coach\'s; after → the coach\'s', async () => {
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(b._id);
    const db = await getDb();
    await db.collection('checkIns').insertOne({ _id: `${x._id}__${W}`, clientId: x._id, weekStart: W, weekEnd: W_END, status: 'submitted', submittedAt: 1_000, notes: 'legacy', progressPhotos: {}, createdAt: 500, updatedAt: 1_000 } as never);
    await caller(b).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    expect(await caller(b).checkIns.get({ clientId: x._id, weekStart: W })).toBeNull();
    expect(await caller(b).checkIns.list({ clientId: x._id })).toEqual([]);
    const own = await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    expect(own._id).toBe(`${x._id}__${W}__${b._id}`);
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).toMatchObject({ notes: 'legacy', status: 'submitted' });
    expect((await docs({ _id: `${x._id}__${W}` }))[0]).not.toHaveProperty('coachId');

    const next = '2026-10-24';
    const since = Number((await db.collection('coachClients').findOne({ _id: `${b._id}__${x._id}` } as never))!.createdAt);
    await db.collection('checkIns').insertOne({ _id: `${x._id}__${next}`, clientId: x._id, weekStart: next, weekEnd: '2026-10-30', status: 'requested', progressPhotos: {}, createdAt: since + 10, updatedAt: since + 10 } as never);
    expect(await caller(b).checkIns.request({ clientId: x._id, weekStart: next, weekEnd: '2026-10-30' })).toMatchObject({ _id: `${x._id}__${next}` });
    // The client still sees the legacy request (no owner to judge it stale by).
    expect((await caller(x).checkIns.list({ byKey: true })).map((d) => d._id)).toContain(`${x._id}__${next}`);
  });

  it('an admin keeps full access; an unrelated coach none', async () => {
    const { b, x, admin } = await handOver();
    await caller(b).checkIns.request({ clientId: x._id, weekStart: W, weekEnd: W_END });
    expect(await caller(admin).checkIns.list({ clientId: x._id })).toHaveLength(2);
    expect(await caller(admin).checkIns.get({ clientId: x._id, weekStart: W })).toMatchObject({ coachId: 'coach-a' });
    expect(await caller(admin).checkIns.get({ clientId: x._id, weekStart: `${W}__${b._id}` })).toMatchObject({ coachId: b._id });
    const stranger = await insertUser({ _id: 'coach-z', role: 'coach' });
    for (const p of [caller(stranger).checkIns.list({ clientId: x._id }), caller(stranger).checkIns.get({ clientId: x._id, weekStart: W }), caller(stranger).checkIns.review({ clientId: x._id, weekStart: W, feedback: 'x' })]) {
      expect(await code(p)).toBe('FORBIDDEN');
    }
  });
});

describe('B3-S13: a re-activated relationship starts clean; the previous stint is archived', () => {
  it('assign back after a release: no stale end fields or terms on the active document; the old stint is kept whole', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).coachClients.updateSubscription({ id: `${a._id}__${x._id}`, sub: { op: 'setPrice', price: 900, currency: 'EGP' } } as never).catch(() => undefined);
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    const ended = await (await getDb()).collection('coachClients').findOne({ _id: `${a._id}__${x._id}` } as never);
    await tick();
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'trial', trialDays: 14 } });
    const rel = (await (await getDb()).collection<Record<string, unknown>>('coachClients').findOne({ _id: `${a._id}__${x._id}` } as never))!;
    expect(rel).toMatchObject({ status: 'active', subscription: { status: 'trial' } });
    for (const stale of ['endedAt', 'endedBy', 'endReason', 'mode', 'subscriptionHistory', 'subscriptionEvents', 'inviteCode']) expect(rel, stale).not.toHaveProperty(stale);
    expect(rel.createdAt).toBeGreaterThan(Number(ended!.createdAt));
    const stints = rel.previousStints as Record<string, unknown>[];
    expect(stints).toHaveLength(1);
    const { _id, coachId, clientId, ...stint } = ended!;
    expect(stints[0]).toMatchObject({ ...stint, status: 'ended', endReason: 'released' });
    expect(stints[0].archivedAt).toEqual(expect.any(Number));
  });

  it('a transfer back (A → B → A) archives A\'s earlier stint; the timeline shows its facts — never its terms — to the other coach', async () => {
    const { a, b, x } = await handOver();
    await caller(a).transfers.create({ clientId: x._id, reason: 'Coming back', mode: 'keep_plans' });
    await caller(b).transfers.resolve({ id: `${a._id}__${x._id}`, action: 'accept' });
    const rel = (await (await getDb()).collection<Record<string, unknown>>('coachClients').findOne({ _id: `${a._id}__${x._id}` } as never))!;
    expect(rel).toMatchObject({ status: 'active' });
    expect(rel).not.toHaveProperty('endedAt');
    expect(rel).not.toHaveProperty('endReason');
    expect(rel.previousStints).toEqual([expect.objectContaining({ status: 'ended', endReason: 'transferred', subscription: expect.any(Object) })]);

    // B (now a former coach) sees only B's own record; A sees A's own record in full and B's as facts.
    const forA = await caller(a).coachClients.list({ clientId: x._id });
    const bsAsSeenByA = forA.find((r) => r.coachId === b._id)!;
    expect(bsAsSeenByA).not.toHaveProperty('subscription');
    const asA = forA.find((r) => r.coachId === a._id)!;
    expect(asA.previousStints?.[0]).toHaveProperty('subscription');
    // A third coach taking X on later sees A's stints as facts only.
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    const c = await insertUser({ _id: 'coach-c', role: 'coach' });
    await givePlan(c._id);
    await caller(c).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    const asSeenByC = (await caller(c).coachClients.list({ clientId: x._id })).find((r) => r.coachId === a._id)!;
    expect(asSeenByC.previousStints).toEqual([expect.objectContaining({ status: 'ended', endReason: 'transferred' })]);
    expect(JSON.stringify(asSeenByC)).not.toMatch(/subscription|price/);
    // The roster's summary view leaves archived stints out.
    const summary = await caller(c).coachClients.list({ coachId: c._id, view: 'summary' });
    expect(summary[0]).not.toHaveProperty('previousStints');
  });

  it('two racing assigns: exactly one activation, the loser\'s slot is given back', async () => {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const x = await insertUser({ _id: 'client-x', role: 'client' });
    await givePlan(a._id, 5);
    await caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } });
    await caller(a).coachClients.end({ id: `${a._id}__${x._id}`, reason: 'released' });
    await tick();
    const results = await Promise.allSettled([1, 2, 3].map(() => caller(a).coachClients.assign({ clientId: x._id, subscription: { status: 'active', months: 1 } })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rel = (await (await getDb()).collection<Record<string, unknown>>('coachClients').findOne({ _id: `${a._id}__${x._id}` } as never))!;
    expect(rel.previousStints).toHaveLength(1);
    const plan = await (await getDb()).collection<CoachPlanDoc>('coachPlans').findOne({ _id: a._id });
    expect(plan?.activeClientCount).toBe(1);
  });
});
