import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc, SubscriptionDoc } from '../../coach-clients/_types.js';
import { effectiveSubscriptionStatus } from '../../admin/_lib/subscription.js';

/**
 * B3.0.1 — B3-S07 at the API (owner: Extend E2, Freeze F-C, auditable events,
 * no silent migration) and B3-S06 (owner R-6: date-based read-only in sync).
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b301_subscription';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

const DAY = 86_400_000;
const REL = 'coach-1__client-1';
function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const as = (u: AuthedUser) => appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
const rel = async () => (await (await getDb()).collection<CoachClientDoc>('coachClients').findOne({ _id: REL }))!;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcMidnight = (ms: number) => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate());

async function world(sub: Partial<SubscriptionDoc> | null) {
  const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
  const client = await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
  const superAdmin = await insertUser({ _id: 'sa-1', role: 'super_admin' });
  const now = Date.now();
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({
    _id: REL,
    coachId: 'coach-1',
    clientId: 'client-1',
    status: 'active',
    createdBy: 'coach-1',
    createdAt: now - 60 * DAY,
    updatedAt: now,
    ...(sub ? { subscription: { status: 'active', startAt: now - 5 * DAY, endAt: now + 25 * DAY, frozenFrom: null, frozenUntil: null, updatedAt: 1, ...sub } } : {}),
  });
  return { coach, client, superAdmin };
}

describe('B3-S07 — Extend (E2) through the API', () => {
  it('extends a running term from its end, records an audit event and no ledger entry', async () => {
    const { coach } = await world({});
    const before = (await rel()).subscription!.endAt;
    const doc = await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 30 } });
    expect(doc.subscription!.endAt - before).toBe(30 * DAY);
    expect((await rel()).subscriptionHistory ?? []).toHaveLength(0);
    expect((await rel()).subscriptionEvents).toEqual([expect.objectContaining({ op: 'extend', actorRole: 'coach', before: expect.objectContaining({ endAt: before }), after: expect.objectContaining({ endAt: before + 30 * DAY }) })]);
    expect(await (await getDb()).collection('adminAuditLogs').countDocuments({})).toBe(0);
  });

  it('a lapsed term restarts from now (the coach preview finally matches the server)', async () => {
    const { coach } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    const t0 = Date.now();
    const doc = await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 7 } });
    expect(doc.subscription!.endAt).toBeGreaterThanOrEqual(t0 + 7 * DAY);
    expect(doc.subscription!.endAt).toBeLessThanOrEqual(Date.now() + 7 * DAY);
    expect(effectiveSubscriptionStatus(doc.subscription, Date.now())).toBe('active');
  });

  it('stored expired / ended / cancelled need a renewal (nothing written)', async () => {
    for (const status of ['expired', 'ended', 'cancelled'] as const) {
      await (await getDb()).dropDatabase();
      const { coach } = await world({ status });
      expect(await reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 7 } }))).toEqual({ code: 'CONFLICT', reason: 'RENEWAL_REQUIRED' });
      expect((await rel()).subscriptionEvents).toBeUndefined();
    }
  });

  it('concurrent changes never lose an update (compare-and-set on the term)', async () => {
    const { coach } = await world({});
    const before = (await rel()).subscription!.endAt;
    const results = await Promise.all(Array.from({ length: 5 }, () => reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 1 } }))));
    const applied = results.filter((r) => r.code === 'OK').length;
    expect(applied).toBeGreaterThanOrEqual(1);
    for (const r of results.filter((x) => x.code !== 'OK')) expect(r).toEqual({ code: 'CONFLICT', reason: 'SUBSCRIPTION_CHANGED' });
    expect((await rel()).subscription!.endAt).toBe(before + applied * DAY);
    expect((await rel()).subscriptionEvents).toHaveLength(applied);
  });
});

describe('back-dated renewals are flagged in the audit event (owner, B3.0.1)', () => {
  it('renewing a lapsed term from 8 days ago is flagged; re-saving a running term at its own start is not', async () => {
    const { coach } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'setTerm', startAt: Date.now() - 8 * DAY, months: 1 } });
    expect((await rel()).subscriptionEvents?.at(-1)).toMatchObject({ op: 'setTerm', backdated: true });
    const running = (await rel()).subscription!;
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'setTerm', startAt: running.startAt, months: 2 } });
    expect((await rel()).subscriptionEvents?.at(-1)).not.toHaveProperty('backdated');
  });
});

describe('B3-S07 — Freeze (F-C) through the API', () => {
  it('a scheduled freeze: stored now, effective only inside its window, end pushed by the frozen days', async () => {
    const { coach } = await world({});
    const from = utcMidnight(Date.now() + 3 * DAY);
    const until = from + 4 * DAY;
    const before = (await rel()).subscription!.endAt;
    const doc = await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'freeze', from, until, note: 'travel' } });
    expect(doc.subscription).toMatchObject({ status: 'frozen', frozenFrom: from, frozenUntil: until, freezeCredit: 4 * DAY, endAt: before + 4 * DAY });
    expect(effectiveSubscriptionStatus(doc.subscription, Date.now())).toBe('active');
    expect(effectiveSubscriptionStatus(doc.subscription, from + DAY)).toBe('frozen');
    expect(effectiveSubscriptionStatus(doc.subscription, until)).toBe('active');
    expect((await rel()).subscriptionHistory ?? []).toHaveLength(0);
  });

  it('refuses back-dated, out-of-term, open-ended-like and non-active freezes with a reason', async () => {
    const { coach } = await world({});
    const call = (from: number, until: number) => reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'freeze', from, until } }));
    expect(await call(Date.now() - 2 * DAY, Date.now() + DAY)).toEqual({ code: 'CONFLICT', reason: 'FREEZE_INVALID_WINDOW' });
    expect(await call(Date.now() + 2 * DAY, Date.now() + 2 * DAY)).toEqual({ code: 'CONFLICT', reason: 'FREEZE_INVALID_WINDOW' });
    expect(await call(Date.now() + 20 * DAY, Date.now() + 40 * DAY)).toEqual({ code: 'CONFLICT', reason: 'FREEZE_OUT_OF_TERM' });
    await (await getDb()).collection('coachClients').updateOne({ _id: REL } as never, { $set: { 'subscription.status': 'trial' } });
    expect(await call(Date.now() + DAY, Date.now() + 2 * DAY)).toEqual({ code: 'CONFLICT', reason: 'FREEZE_NOT_ALLOWED' });
    expect((await rel()).subscriptionEvents).toBeUndefined();
  });

  it('unfreeze before the freeze starts gives the whole compensation back; a second unfreeze is refused', async () => {
    const { coach } = await world({});
    const original = (await rel()).subscription!.endAt;
    const from = utcMidnight(Date.now() + 3 * DAY);
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'freeze', from, until: from + 4 * DAY } });
    const doc = await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'unfreeze' } });
    expect(doc.subscription).toMatchObject({ status: 'active', endAt: original, frozenFrom: null, frozenUntil: null, freezeCredit: null });
    expect(await reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'unfreeze' } }))).toEqual({ code: 'CONFLICT', reason: 'NOT_FROZEN' });
    expect((await rel()).subscriptionEvents?.map((e) => e.op)).toEqual(['freeze', 'unfreeze']);
  });

  it('a freeze stored before B3.0.1 keeps its old behaviour (no migration) and unfreezes without moving the end', async () => {
    const { coach } = await world({ status: 'frozen', frozenFrom: Date.now() + 5 * DAY, frozenUntil: Date.now() + 9 * DAY });
    const legacy = (await rel()).subscription!;
    expect(effectiveSubscriptionStatus(legacy, Date.now())).toBe('frozen');
    const doc = await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'unfreeze' } });
    expect(doc.subscription!.endAt).toBe(legacy.endAt);
  });

  it("an admin change is audited (who, which relationship, before / after); a coach's is recorded as an event", async () => {
    const { superAdmin } = await world({});
    await as(superAdmin).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 2 } });
    const audit = await (await getDb()).collection('adminAuditLogs').findOne({ action: 'subscription.extend' });
    expect(audit).toMatchObject({ actorId: 'sa-1', targetUserId: 'client-1', metadata: { relationshipId: REL, relationshipStatus: 'active', before: expect.any(Object), after: expect.any(Object) } });
    expect((await rel()).subscriptionEvents?.[0]).toMatchObject({ op: 'extend', actorRole: 'admin' });
  });
});

// ---------------------------------------------------------------------------
// B3-S06 — sync.push refuses logs dated in proven read-only time only
// ---------------------------------------------------------------------------

const workout = (day: string) => ({ id: day, updatedAt: Date.now(), baseRev: null, data: { id: day, date: day, startedAt: 1, finished: true } });
const nutrition = (day: string) => ({ id: day, updatedAt: Date.now(), baseRev: null, data: { id: day, date: day, waterMl: 500 } });
const cardio = (id: string, day?: string) => ({ id, updatedAt: Date.now(), baseRev: null, data: { id, ...(day ? { date: day } : {}), minutes: 20 } });
const push = (u: AuthedUser, collection: string, records: unknown[]) => as(u).sync.push({ collection, records: records as never });
const stored = async (collection: string) => (await (await getDb()).collection('syncRecords').find({ collection }).toArray()).map((r) => r.recordId).sort();

describe('B3-S06 — read-only enforcement in sync.push (activity date, never arrival time)', () => {
  it('offline after expiry: a log dated after the term is refused (kept on the device); in-term work synced late is accepted', async () => {
    const { client } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    const today = dayOf(Date.now());
    const inTerm = dayOf(Date.now() - 20 * DAY);
    const res = await push(client, 'workoutLogs', [workout(today), workout(inTerm)]);
    expect(res.rejected).toEqual([{ id: today, reason: 'SUBSCRIPTION_READ_ONLY' }]);
    expect(res.accepted.map((a) => a.id)).toEqual([inTerm]);
    expect(await stored('workoutLogs')).toEqual([inTerm]);
  });

  it('applies to nutrition and cardio (by data.date); never to weight, measurements, photos, checklists or reminders', async () => {
    const { client } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    const today = dayOf(Date.now());
    expect((await push(client, 'nutritionLogs', [nutrition(today)])).rejected).toEqual([{ id: today, reason: 'SUBSCRIPTION_READ_ONLY' }]);
    expect((await push(client, 'cardioLogs', [cardio('c1', today), cardio('c2')])).rejected).toEqual([{ id: 'c1', reason: 'SUBSCRIPTION_READ_ONLY' }]);
    expect((await push(client, 'weightLogs', [{ id: today, updatedAt: Date.now(), baseRev: null, data: { id: today, date: today, kg: 80 } }])).rejected).toEqual([]);
    expect((await push(client, 'dailyChecklists', [{ id: today, updatedAt: Date.now(), baseRev: null, data: { id: today, date: today } }])).rejected).toEqual([]);
  });

  it('pre-term and pre-relationship days, a pending subscription and a client with no coach are never refused', async () => {
    const { client } = await world({ startAt: Date.now() + 2 * DAY, endAt: Date.now() + 30 * DAY });
    expect((await push(client, 'workoutLogs', [workout(dayOf(Date.now() - 3 * DAY)), workout(dayOf(Date.now() - 90 * DAY))])).rejected).toEqual([]);
    await (await getDb()).collection('coachClients').updateOne({ _id: REL } as never, { $set: { subscription: { status: 'pending', startAt: Date.now() - 30 * DAY, endAt: Date.now() - 30 * DAY, updatedAt: 1 } } });
    expect((await push(client, 'workoutLogs', [workout(dayOf(Date.now() + 0))])).rejected).toEqual([]);
    await (await getDb()).collection('coachClients').deleteMany({});
    expect((await push(client, 'nutritionLogs', [nutrition(dayOf(Date.now()))])).rejected).toEqual([]);
  });

  it('renewal gap: days between a lapse and the renewal are refused; a back-dated renewal covers them, and the refused log is then accepted on retry', async () => {
    const { coach, client } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    const gapDay = dayOf(Date.now() - 5 * DAY);
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'setTerm', startAt: Date.now(), months: 1 } });
    expect((await push(client, 'workoutLogs', [workout(gapDay)])).rejected).toEqual([{ id: gapDay, reason: 'SUBSCRIPTION_READ_ONLY' }]);
    expect((await push(client, 'workoutLogs', [workout(dayOf(Date.now()))])).rejected).toEqual([]);
    // The coach decides the renewal should have started 8 days ago: the same record now syncs.
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'setTerm', startAt: Date.now() - 8 * DAY, months: 1 } });
    const retry = await push(client, 'workoutLogs', [workout(gapDay)]);
    expect(retry.rejected).toEqual([]);
    expect(retry.accepted.map((a) => a.id)).toEqual([gapDay]);
  });

  it('an extension of a lapsed term (E2) leaves the lapse read-only; days after the extension are fine', async () => {
    const { coach, client } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'extend', days: 30 } });
    const res = await push(client, 'workoutLogs', [workout(dayOf(Date.now() - 5 * DAY)), workout(dayOf(Date.now()))]);
    expect(res.rejected.map((r) => r.id)).toEqual([dayOf(Date.now() - 5 * DAY)]);
  });

  it('scheduled freeze: days inside the window are refused; cancelling the freeze makes the same log syncable', async () => {
    const { coach, client } = await world({});
    const from = utcMidnight(Date.now() + 3 * DAY);
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'freeze', from, until: from + 4 * DAY } });
    const inside = dayOf(from + DAY);
    expect((await push(client, 'workoutLogs', [workout(inside), workout(dayOf(Date.now()))])).rejected).toEqual([{ id: inside, reason: 'SUBSCRIPTION_READ_ONLY' }]);
    await as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'unfreeze' } });
    expect((await push(client, 'workoutLogs', [workout(inside)])).rejected).toEqual([]);
  });

  it('a refusal never touches an existing server copy and never blocks the rest of the batch', async () => {
    const { client } = await world({ startAt: Date.now() - 40 * DAY, endAt: Date.now() - 10 * DAY });
    const inTerm = dayOf(Date.now() - 20 * DAY);
    await push(client, 'workoutLogs', [workout(inTerm)]);
    const res = await push(client, 'workoutLogs', [workout(dayOf(Date.now())), { ...workout(inTerm), baseRev: 1, data: { ...workout(inTerm).data, note: 'edited later' } }]);
    expect(res.rejected.map((r) => r.reason)).toEqual(['SUBSCRIPTION_READ_ONLY']);
    expect(res.accepted).toEqual([{ id: inTerm, rev: 2 }]);
  });
});
