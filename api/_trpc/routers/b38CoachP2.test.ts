import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc, CoachPlanDoc } from '../../coach-clients/_types.js';
import { GATED_IN_HANDLER, LAPSED_COACH_ALLOWED } from '../../_lib/coachEntitlement.js';
import { resolveUploadTarget } from '../../media/_lib/policy.js';

/**
 * B3.8 (owner decision 4, "P2"): a coach whose Forma plan has lapsed or was suspended is read-only
 * on the SERVER — every coach mutation is refused (default-deny) except the recovery / read-marker /
 * client-protecting ones; reads keep working; clients and admins are never affected.
 */
let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b38_p2';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
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
const as = (u: AuthedUser) => appRouter.createCaller({ req: {} as VercelRequest, res: { setHeader: () => undefined, appendHeader: () => undefined } as unknown as VercelResponse, user: u } as Context);
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
async function setPlan(coachId: string, p: Partial<CoachPlanDoc>) {
  const now = Date.now();
  await (await getDb()).collection<CoachPlanDoc>('coachPlans').updateOne({ _id: coachId }, { $set: { plan: 'forma', status: 'active', maxClients: 10, activeClientCount: 1, endsAt: now + 30 * DAY, createdAt: now, updatedAt: now, ...p } }, { upsert: true });
}
const expire = (coachId: string) => setPlan(coachId, { endsAt: Date.now() - 60_000 });
async function world() {
  const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
  const client = await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
  const admin = await insertUser({ _id: 'admin-1', role: 'super_admin' });
  const now = Date.now();
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({
    _id: REL,
    coachId: 'coach-1',
    clientId: 'client-1',
    status: 'active',
    createdBy: 'coach-1',
    createdAt: now - 30 * DAY,
    updatedAt: now,
    subscription: { status: 'active', startAt: now - DAY, endAt: now + 29 * DAY, months: 1, price: 900, currency: 'EGP', termId: 'term-1', frozenFrom: null, frozenUntil: null, updatedAt: 1 },
  });
  await setPlan('coach-1', {});
  return { coach, client, admin };
}

/** Every mutation path in the API. */
const MUTATIONS = Object.entries((appRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string } }> } })._def.procedures)
  .filter(([, p]) => p._def.type === 'mutation')
  .map(([path]) => path)
  .sort();
function call(u: AuthedUser, path: string, input: unknown): Promise<unknown> {
  let fn: unknown = as(u);
  for (const part of path.split('.')) fn = (fn as Record<string, unknown>)[part];
  return (fn as (i: unknown) => Promise<unknown>)(input);
}

describe('the policy itself', () => {
  it('every allowed path is a real mutation (no typo can silently open a gate)', () => {
    for (const p of [...LAPSED_COACH_ALLOWED, ...GATED_IN_HANDLER]) expect(MUTATIONS, p).toContain(p);
  });

  it('the allow-list is exactly the recovery / read-marker / client-protecting set (+ signed media links, a read — MD-02)', () => {
    expect([...LAPSED_COACH_ALLOWED].sort()).toEqual([
      'auth.changePassword', 'auth.confirmPasswordReset', 'auth.googleSignIn', 'auth.login', 'auth.logout', 'auth.refresh', 'auth.requestPasswordReset', 'auth.signup', 'auth.updateProfile',
      'coachClients.end', 'coachPlanRequests.cancel', 'coachPlanRequests.submitSubscription', 'coachPlans.createTrial', 'contact.submit', 'invites.revoke',
      'media.sign', 'messages.markRead', 'notifications.markRead', 'transfers.resolve', 'usage.bump', 'usage.recordActiveDay',
    ].sort());
  });
});

describe('an expired coach — every other coach write is refused before anything runs', () => {
  it('each of the API’s mutations outside the allow-list answers SUBSCRIPTION_EXPIRED (default-deny)', async () => {
    const { coach } = await world();
    await expire('coach-1');
    const blocked = MUTATIONS.filter((p) => !LAPSED_COACH_ALLOWED.has(p) && !GATED_IN_HANDLER.has(p));
    expect(blocked.length).toBeGreaterThan(60);
    for (const path of blocked) {
      expect(await reasonOf(call(coach, path, {})), path).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    }
  });

  it('an admin-suspended plan is refused the same way, as SUBSCRIPTION_SUSPENDED', async () => {
    const { coach } = await world();
    await setPlan('coach-1', { status: 'suspended' });
    for (const path of ['workoutPlan.save', 'coachAssets.foods.save', 'clientPayments.record', 'checkIns.request', 'invites.create']) {
      expect(await reasonOf(call(coach, path, {})), path).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_SUSPENDED' });
    }
  });

  it('nothing was written by any of them: a term change, a payment, a plan', async () => {
    const { coach } = await world();
    await expire('coach-1');
    expect(await reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'renew', months: 1 } }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    expect(await reasonOf(as(coach).clientPayments.record({ clientId: 'client-1', termId: 'term-1', amountMinor: 100, method: 'cash', paidAt: Date.now(), requestId: 'req-p2-000001' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    const db = await getDb();
    expect((await db.collection<CoachClientDoc>('coachClients').findOne({ _id: REL }))!.subscriptionHistory ?? []).toHaveLength(0);
    expect(await db.collection('clientPayments').countDocuments({})).toBe(0);
  });
});

describe('messaging (owner: was a lapsed coach’s message really delivered?)', () => {
  it('an expired coach’s new message is refused and NOT stored; reading and marking read still work', async () => {
    const { coach, client } = await world();
    const sent = await as(coach).messages.send({ clientId: 'client-1', text: 'before', clientMsgId: 'cm-before-1', coachId: 'coach-1' });
    await expire('coach-1');
    expect(await reasonOf(as(coach).messages.send({ clientId: 'client-1', text: 'after', clientMsgId: 'cm-after-1', coachId: 'coach-1' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    const msgs = await (await getDb()).collection('messages').find({ clientId: 'client-1' }).toArray();
    expect(msgs.map((m) => m.body)).toEqual(['before']);
    // The offline queue retrying the message that WAS delivered before the lapse is acknowledged, not refused.
    const replay = await as(coach).messages.send({ clientId: 'client-1', text: 'before', clientMsgId: 'cm-before-1', coachId: 'coach-1' });
    expect(replay.id).toBe(sent.id);
    expect(await reasonOf(as(coach).messages.list({ clientId: 'client-1' }))).toEqual({ code: 'OK' });
    expect(await reasonOf(as(coach).messages.markRead({ clientId: 'client-1' } as never))).not.toMatchObject({ reason: 'SUBSCRIPTION_EXPIRED' });
    // The client is not affected: they can still write to their coach.
    await expect(as(client).messages.send({ clientId: 'client-1', text: 'hi coach', clientMsgId: 'cm-client-1' })).resolves.toBeTruthy();
  });

  it('edits, deletes and reactions are refused too', async () => {
    const { coach } = await world();
    const sent = await as(coach).messages.send({ clientId: 'client-1', text: 'x', clientMsgId: 'cm-x-1', coachId: 'coach-1' });
    await expire('coach-1');
    expect(await reasonOf(as(coach).messages.edit({ id: sent.id, text: 'y' } as never))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    expect(await reasonOf(as(coach).messages.delete({ id: sent.id } as never))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    expect(await reasonOf(as(coach).messages.react({ id: sent.id, emoji: '👍' } as never))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
  });

  it('uploads: only the coach’s own photo; attachments and library media are refused at the start', async () => {
    const { coach } = await world();
    await expire('coach-1');
    await expect(resolveUploadTarget(coach, { category: 'message', clientId: 'client-1', mimeType: 'image/jpeg', name: 'a.jpg', size: 100 })).rejects.toMatchObject({ status: 403, code: 'planLapsed' });
    await expect(resolveUploadTarget(coach, { category: 'exercise', mimeType: 'image/jpeg', name: 'a.jpg', size: 100 })).rejects.toMatchObject({ status: 403, code: 'planLapsed' });
    await expect(resolveUploadTarget(coach, { category: 'avatar', mimeType: 'image/jpeg', name: 'a.jpg', size: 100 })).resolves.toMatchObject({ category: 'avatar' });
  });
});

describe('what a lapsed coach may still do', () => {
  it('account, Forma renewal request, releasing a client', async () => {
    const { coach } = await world();
    await expire('coach-1');
    await expect(as(coach).auth.updateProfile({ displayName: 'Coach One' } as never)).resolves.toBeTruthy();
    expect((await reasonOf(as(coach).coachPlanRequests.submitSubscription({} as never))).reason).not.toBe('SUBSCRIPTION_EXPIRED');
    await expect(as(coach).coachClients.end({ id: REL })).resolves.toBeTruthy();
  });

  it('reads keep working (clients, relationships, payments)', async () => {
    const { coach } = await world();
    await expire('coach-1');
    await expect(as(coach).coachClients.list({})).resolves.toHaveLength(1);
    await expect(as(coach).clientPayments.list({})).resolves.toEqual([]);
    await expect(as(coach).coachClients.listMyClientUsers({})).resolves.toBeTruthy();
  });
});

describe('authoritative and current — never a stale session', () => {
  it('the plan is read at the moment of each write: a plan that lapses between two calls refuses the second; renewing restores writes', async () => {
    const { coach } = await world();
    await expect(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'correct', price: 950 } })).resolves.toBeTruthy();
    await expire('coach-1');
    expect(await reasonOf(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'correct', price: 960 } }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    await setPlan('coach-1', { endsAt: Date.now() + 30 * DAY });
    await expect(as(coach).coachClients.updateSubscription({ id: REL, sub: { op: 'correct', price: 960 } })).resolves.toBeTruthy();
  });

  it('B38F-R3 (owner, 2026-10-22): a coach with NO plan document is read-only too (NO_SUBSCRIPTION) — every gated mutation, default-deny; admins and clients never are', async () => {
    const { coach, admin, client } = await world();
    await (await getDb()).collection('coachPlans').deleteMany({});
    const blocked = MUTATIONS.filter((p) => !LAPSED_COACH_ALLOWED.has(p) && !GATED_IN_HANDLER.has(p));
    for (const path of blocked) {
      expect(await reasonOf(call(coach, path, {})), path).toEqual({ code: 'PRECONDITION_FAILED', reason: 'NO_SUBSCRIPTION' });
    }
    expect(await reasonOf(as(coach).messages.send({ clientId: 'client-1', text: 'x', clientMsgId: 'cm-noplan-1', coachId: 'coach-1' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'NO_SUBSCRIPTION' });
    await expect(resolveUploadTarget(coach, { category: 'message', clientId: 'client-1', mimeType: 'image/jpeg', name: 'a.jpg', size: 100 })).rejects.toMatchObject({ status: 403, code: 'noPlan' });
    await expect(resolveUploadTarget(coach, { category: 'avatar', mimeType: 'image/jpeg', name: 'a.jpg', size: 100 })).resolves.toMatchObject({ category: 'avatar' });
    // Reads, the account, activation and support stay open.
    await expect(as(coach).coachClients.list({})).resolves.toHaveLength(1);
    await expect(as(coach).auth.updateProfile({ displayName: 'Coach One' } as never)).resolves.toBeTruthy();
    expect((await reasonOf(as(coach).coachPlanRequests.submitSubscription({} as never))).reason).not.toBe('NO_SUBSCRIPTION');
    // Admins and clients are unaffected.
    await expect(as(admin).coachClients.updateSubscription({ id: REL, sub: { op: 'correct', price: 980 } })).resolves.toBeTruthy();
    await expect(as(client).auth.updateProfile({ displayName: 'Client One' } as never)).resolves.toBeTruthy();
  });

  it('a suspended ACCOUNT keeps its own, earlier refusal (unchanged)', async () => {
    const { coach } = await world();
    await expire('coach-1');
    const suspended = { ...coach, accountStatus: 'suspended' as const };
    expect(await reasonOf(as(suspended).messages.send({ clientId: 'client-1', text: 'x', clientMsgId: 'cm-s-1', coachId: 'coach-1' }))).toMatchObject({ reason: 'ACCOUNT_NOT_ACTIVE' });
  });
});

/**
 * B3.8 final review (owner, 2026-10-22): an expired or suspended Forma coach can never RECEIVE a
 * client through a transfer, whoever completes it — the client's current coach accepting the
 * request, an admin accepting it (or overriding its terms), or an admin moving the client directly.
 * `transfers.resolve` stays callable while lapsed (it protects the client), so the receiving
 * coach's plan is checked inside the transfer itself (`reserveClientSlot`, in its transaction).
 * A refusal changes nothing: no relationship, ownership, capacity count, term or payment moves, and
 * the request goes back to pending so it can be completed once the receiving coach renews.
 */
describe('transfer-in to a lapsed coach — refused whoever accepts, nothing moves', () => {
  const TO_REQ = 'coach-2__client-1';
  /** Every collection a transfer could touch, minus the request itself (checked on its own). */
  async function snapshot() {
    const db = await getDb();
    const out: Record<string, unknown[]> = {};
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (name === 'transferRequests' || name === 'rateLimits') continue;
      out[name] = await db.collection(name).find({}).sort({ _id: 1 }).toArray();
    }
    return out;
  }
  const request = async () => (await getDb()).collection('transferRequests').findOne({ _id: TO_REQ as never });
  /** coach-1 coaches client-1 (with a recorded payment); live coach-2 asks for the client, then lapses. */
  async function pendingTransfer(lapse: 'expired' | 'suspended') {
    const w = await world();
    const coach2 = await insertUser({ _id: 'coach-2', role: 'coach' });
    await setPlan('coach-2', { activeClientCount: 0 });
    await as(w.coach).clientPayments.record({ clientId: 'client-1', termId: 'term-1', amountMinor: 30_000, method: 'cash', paidAt: Date.now(), requestId: 'req-transfer-pay-1' });
    await as(coach2).transfers.create({ clientId: 'client-1', reason: 'Closer to home', mode: 'keep_plans', subscriptionHandling: 'keep' });
    await setPlan('coach-2', lapse === 'suspended' ? { status: 'suspended', activeClientCount: 0 } : { endsAt: Date.now() - 60_000, activeClientCount: 0 });
    // B3.9: the refusal names the RECEIVING coach (the approving coach or admin must not read it as their own plan).
    return { ...w, coach2, reason: 'DESTINATION_NOT_ACCEPTING' };
  }
  async function expectNothingMoved(before: Awaited<ReturnType<typeof snapshot>>, coach2: AuthedUser) {
    expect(await snapshot()).toEqual(before);
    const db = await getDb();
    expect(await db.collection<CoachClientDoc>('coachClients').findOne({ _id: REL })).toMatchObject({ coachId: 'coach-1', status: 'active', subscription: { termId: 'term-1', price: 900 } });
    expect(await db.collection<CoachClientDoc>('coachClients').countDocuments({ coachId: 'coach-2' })).toBe(0);
    expect((await db.collection<UserDoc>('users').findOne({ _id: 'client-1' }))?.assignedCoachId).toBe('coach-1');
    expect((await db.collection<CoachPlanDoc>('coachPlans').findOne({ _id: 'coach-1' }))?.activeClientCount).toBe(1);
    expect((await db.collection<CoachPlanDoc>('coachPlans').findOne({ _id: 'coach-2' }))?.activeClientCount).toBe(0);
    // The request is pending again (never left "accepted" with no transfer behind it).
    expect(await request()).toMatchObject({ status: 'pending', reviewedAt: null, reviewedBy: null });
    // No coaching access was granted: no roster entry, no client data, no relationship, no payments.
    await expect(as(coach2).coachClients.list({})).resolves.toEqual([]);
    expect(await reasonOf(as(coach2).checkIns.get({ clientId: 'client-1', weekStart: '2026-10-19' }))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await reasonOf(as(coach2).coachClients.get({ id: REL }))).toMatchObject({ code: 'FORBIDDEN' });
    await expect(as(coach2).clientPayments.list({})).resolves.toEqual([]);
  }

  for (const lapse of ['expired', 'suspended'] as const) {
    it(`${lapse}: the client's current coach accepting the request is refused (DESTINATION_NOT_ACCEPTING); nothing moves`, async () => {
      const { coach, coach2, reason } = await pendingTransfer(lapse);
      const before = await snapshot();
      expect(await reasonOf(as(coach).transfers.resolve({ id: TO_REQ, action: 'accept' }))).toEqual({ code: 'PRECONDITION_FAILED', reason });
      await expectNothingMoved(before, coach2);
    });

    it(`${lapse}: an admin accepting it — even with a new package — is refused; nothing moves`, async () => {
      const { admin, coach2, reason } = await pendingTransfer(lapse);
      const before = await snapshot();
      expect(await reasonOf(as(admin).transfers.resolve({ id: TO_REQ, action: 'accept' }))).toEqual({ code: 'PRECONDITION_FAILED', reason });
      expect(
        await reasonOf(as(admin).transfers.resolve({ id: TO_REQ, action: 'accept', subscriptionHandling: 'new', newSubscription: { status: 'active', days: 30, price: 500 } })),
      ).toEqual({ code: 'PRECONDITION_FAILED', reason });
      await expectNothingMoved(before, coach2);
    });

    it(`${lapse}: an admin moving the client directly to that coach is refused; nothing moves`, async () => {
      const { admin, coach2, reason } = await pendingTransfer(lapse);
      const before = await snapshot();
      expect(await reasonOf(as(admin).coachClients.transfer({ id: REL, toCoachId: 'coach-2', mode: 'keep_plans', subscriptionHandling: 'keep' }))).toEqual({ code: 'PRECONDITION_FAILED', reason });
      await expectNothingMoved(before, coach2);
    });
  }

  it('the lapsed coach cannot ask for a client, or take one through an invite made while live', async () => {
    const { coach2 } = await pendingTransfer('expired');
    await as(coach2).transfers.resolve({ id: TO_REQ, action: 'cancel' });
    expect(await reasonOf(as(coach2).transfers.create({ clientId: 'client-1', reason: 'again' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    await setPlan('coach-2', { activeClientCount: 0 });
    const inv = await as(coach2).invites.create({ email: 'new-client@t.test', displayName: 'New Client' });
    await setPlan('coach-2', { endsAt: Date.now() - 60_000, activeClientCount: 0 });
    const anon = appRouter.createCaller({ req: { headers: {} } as VercelRequest, res: { setHeader: () => undefined, appendHeader: () => undefined } as unknown as VercelResponse, user: null } as Context);
    expect(await reasonOf(anon.invites.claim({ code: inv._id, phone: '+201000000000', password: 'long-enough-1' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'SUBSCRIPTION_EXPIRED' });
    const db = await getDb();
    expect(await db.collection('users').countDocuments({ emailLower: 'new-client@t.test' })).toBe(0);
    expect(await db.collection('coachClients').countDocuments({ coachId: 'coach-2' })).toBe(0);
    expect((await db.collection<CoachPlanDoc>('coachPlans').findOne({ _id: 'coach-2' }))?.activeClientCount).toBe(0);
    expect((await db.collection('signupInvites').findOne({ _id: inv._id as never }))?.status).toBe('pending');
  });

  it('still allowed: the lapsed requester withdraws; the current coach rejects; after renewal the same request completes', async () => {
    const { coach, coach2 } = await pendingTransfer('expired');
    await expect(as(coach2).transfers.resolve({ id: TO_REQ, action: 'cancel' })).resolves.toMatchObject({ status: 'cancelled' });
    // A request made while live is rejected by the current coach while the requester is lapsed.
    await setPlan('coach-2', { activeClientCount: 0 });
    await as(coach2).transfers.create({ clientId: 'client-1', reason: 'second try', mode: 'keep_plans', subscriptionHandling: 'keep' });
    await expire('coach-2');
    await expect(as(coach).transfers.resolve({ id: TO_REQ, action: 'reject' })).resolves.toMatchObject({ status: 'rejected' });
    // Refused while lapsed, completed after the requester renews — the request was kept pending.
    await setPlan('coach-2', { activeClientCount: 0 });
    await as(coach2).transfers.create({ clientId: 'client-1', reason: 'third try', mode: 'keep_plans', subscriptionHandling: 'keep' });
    await expire('coach-2');
    expect(await reasonOf(as(coach).transfers.resolve({ id: TO_REQ, action: 'accept' }))).toEqual({ code: 'PRECONDITION_FAILED', reason: 'DESTINATION_NOT_ACCEPTING' });
    await setPlan('coach-2', { endsAt: Date.now() + 30 * DAY, activeClientCount: 0 });
    await expect(as(coach).transfers.resolve({ id: TO_REQ, action: 'accept' })).resolves.toMatchObject({ status: 'accepted' });
    const db = await getDb();
    expect((await db.collection<UserDoc>('users').findOne({ _id: 'client-1' }))?.assignedCoachId).toBe('coach-2');
    expect((await db.collection<CoachPlanDoc>('coachPlans').findOne({ _id: 'coach-1' }))?.activeClientCount).toBe(0);
    expect((await db.collection<CoachPlanDoc>('coachPlans').findOne({ _id: 'coach-2' }))?.activeClientCount).toBe(1);
    // "Keep" hands over the term without the previous coach's price or term id; their payment stays theirs.
    const moved = await db.collection<CoachClientDoc>('coachClients').findOne({ _id: TO_REQ });
    expect(moved?.subscription?.price).toBeUndefined();
    expect(moved?.subscription?.termId).not.toBe('term-1');
    expect(await db.collection('clientPayments').countDocuments({ coachId: 'coach-1', clientId: 'client-1' })).toBe(1);
    await expect(as(coach2).clientPayments.list({})).resolves.toEqual([]);
  });

  it('a lapsed CURRENT coach can still hand the client to a live coach, and release a client', async () => {
    const { coach } = await world();
    const coach2 = await insertUser({ _id: 'coach-2', role: 'coach' });
    await setPlan('coach-2', { activeClientCount: 0 });
    await as(coach2).transfers.create({ clientId: 'client-1', reason: 'Coach is away', mode: 'keep_plans', subscriptionHandling: 'keep' });
    await expire('coach-1');
    await expect(as(coach).transfers.resolve({ id: TO_REQ, action: 'accept' })).resolves.toMatchObject({ status: 'accepted' });
    expect((await (await getDb()).collection<UserDoc>('users').findOne({ _id: 'client-1' }))?.assignedCoachId).toBe('coach-2');
    const now = Date.now();
    await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: 'coach-1__client-9', coachId: 'coach-1', clientId: 'client-9', status: 'active', createdBy: 'coach-1', createdAt: now, updatedAt: now });
    await expect(as(coach).coachClients.end({ id: 'coach-1__client-9' })).resolves.toBeTruthy();
  });
});

/**
 * B3.8 final (owner, B38F-R3): every way a coach comes to exist writes the plan with the account
 * (one transaction), and the recovery path never hands out a second trial or extends an entitlement.
 */
describe('coach creation and trial recovery — one plan, never a second trial', () => {
  const plans = async () => (await getDb()).collection<CoachPlanDoc>('coachPlans');

  it('createTrial: a coach account with no plan and no Forma history gets a trial, once; writes are then allowed', async () => {
    const fresh = await insertUser({ _id: 'coach-new', role: 'coach' });
    expect(await reasonOf(as(fresh).workoutPlan.save({} as never))).toMatchObject({ reason: 'NO_SUBSCRIPTION' });
    const first = await as(fresh).coachPlans.createTrial();
    expect(first).toMatchObject({ plan: 'trial' });
    const doc = await (await plans()).findOne({ _id: 'coach-new' });
    const again = await as(fresh).coachPlans.createTrial();
    expect(again.endsAt).toBe(first.endsAt);
    expect(await (await plans()).countDocuments({ _id: 'coach-new' })).toBe(1);
    const startedAt = (d: unknown) => (d as { startedAt?: number } | null)?.startedAt;
    expect(startedAt(await (await plans()).findOne({ _id: 'coach-new' }))).toBe(startedAt(doc));
    expect((await reasonOf(as(fresh).workoutPlan.save({} as never))).reason).not.toBe('NO_SUBSCRIPTION');
  });

  it('createTrial: an account with Forma history but no plan document is refused — no second trial', async () => {
    const { coach } = await world(); // coach-1 has a client relationship
    await (await plans()).deleteMany({});
    expect(await reasonOf(as(coach).coachPlans.createTrial())).toEqual({ code: 'PRECONDITION_FAILED', reason: 'NO_SUBSCRIPTION' });
    expect(await (await plans()).countDocuments({})).toBe(0);
    const other = await insertUser({ _id: 'coach-req', role: 'coach' });
    await (await getDb()).collection('coachPlanRequests').insertOne({ _id: 'req-old' as never, coachId: 'coach-req', type: 'trial_expired', status: 'rejected', requestedAt: 1 });
    expect(await reasonOf(as(other).coachPlans.createTrial())).toEqual({ code: 'PRECONDITION_FAILED', reason: 'NO_SUBSCRIPTION' });
    expect(await (await plans()).countDocuments({ _id: 'coach-req' })).toBe(0);
  });

  it('createTrial never extends or resets an existing plan (an expired trial stays expired)', async () => {
    const { coach } = await world();
    await expire('coach-1');
    const before = await (await plans()).findOne({ _id: 'coach-1' });
    const res = await as(coach).coachPlans.createTrial();
    expect(res.endsAt).toBe(before!.endsAt);
    expect(await (await plans()).findOne({ _id: 'coach-1' })).toEqual(before);
    expect(await reasonOf(as(coach).workoutPlan.save({} as never))).toMatchObject({ reason: 'SUBSCRIPTION_EXPIRED' });
  });

  it('an admin-created coach, and a client promoted to coach, exist only with their plan; promoting again gives no second trial', async () => {
    const { client } = await world();
    const sup = await insertUser({ _id: 'super-1', role: 'super_admin' });
    const made = await as(sup).adminUsers.create({ email: 'made@t.test', password: 'long-enough-1', displayName: 'Made Coach', role: 'coach' });
    expect(await (await plans()).findOne({ _id: made.id })).toMatchObject({ plan: 'trial' });
    await as(sup).adminUsers.setRole({ id: client.id, role: 'coach' });
    const plan = await (await plans()).findOne({ _id: client.id });
    expect(plan).toMatchObject({ plan: 'trial' });
    await as(sup).adminUsers.setRole({ id: client.id, role: 'client' });
    await as(sup).adminUsers.setRole({ id: client.id, role: 'coach' });
    expect(await (await plans()).findOne({ _id: client.id })).toEqual(plan);
  });
});
