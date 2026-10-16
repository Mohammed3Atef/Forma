import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import type { MessageDoc } from '../../messages/_data.js';
import { resolveUploadTarget } from '../../media/_lib/policy.js';

/**
 * B3.0.1 — B3-S14 (owner R-4 = Option C: per-coach conversations, enforced
 * server-side) and B3-S04 (owner O-17: suspended accounts read, never write).
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b301_messaging';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

function userDoc(o: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
}
async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const doc = userDoc(o);
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const ctxFor = (user: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user });
const as = (u: AuthedUser) => appRouter.createCaller(ctxFor(u));
const reasonOf = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};

async function relate(coachId: string, clientId: string, createdAt = Date.now() - 60_000) {
  const doc: CoachClientDoc = { _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active', createdBy: coachId, createdAt, updatedAt: createdAt };
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne(doc);
  await (await getDb()).collection<UserDoc>('users').updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId } });
}
/** The end state `transferClientWithMode` writes (ended old relationship, new active one, client re-pointed). */
async function transfer(fromCoach: string, toCoach: string, clientId: string) {
  const now = Date.now();
  const col = (await getDb()).collection<CoachClientDoc>('coachClients');
  await col.updateOne({ _id: `${fromCoach}__${clientId}` }, { $set: { status: 'ended', endedAt: now, endReason: 'transferred', mode: 'keep_plans', updatedAt: now } });
  await col.insertOne({ _id: `${toCoach}__${clientId}`, coachId: toCoach, clientId, status: 'active', createdBy: 'admin', createdAt: now, updatedAt: now });
  await (await getDb()).collection<UserDoc>('users').updateOne({ _id: clientId }, { $set: { assignedCoachId: toCoach } });
}
async function insertLegacy(m: Partial<MessageDoc> & { createdAt: number }) {
  await (await getDb()).collection<MessageDoc>('messages').insertOne({ _id: `legacy_${Math.random()}`, clientId: 'client-1', fromUserId: 'client-1', fromRole: 'client', body: 'legacy', seenAt: null, updatedAt: m.createdAt, ...m });
}
/** Distinct `createdAt` between sends, so thread order is deterministic. */
const tick = () => new Promise((r) => setTimeout(r, 3));

describe('B3-S14 — a coach sees only their own conversation (transfer A → B)', () => {
  async function scenario() {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    const superAdmin = await insertUser({ _id: 'sa', role: 'super_admin' });
    await relate(coachA.id, client.id, Date.now() - 7_200_000);
    await insertLegacy({ body: 'legacy from client', createdAt: Date.now() - 3_600_000 });
    await insertLegacy({ fromUserId: 'coach-a', fromRole: 'coach', body: 'legacy from A', createdAt: Date.now() - 3_000_000 });
    await as(coachA).messages.send({ clientId: client.id, text: 'A: how was training?' });
    await tick();
    const toA = await as(client).messages.send({ clientId: client.id, text: 'client: knee hurts', clientMsgId: 'op-1', coachId: coachA.id });
    return { client, coachA, coachB, superAdmin, toA };
  }

  it('before the transfer A sees its conversation plus the legacy lines it wrote — never a legacy line from the client', async () => {
    const { client, coachA } = await scenario();
    const page = await as(coachA).messages.list({ clientId: client.id });
    expect(page.messages.map((m) => m.body)).toEqual(['legacy from A', 'A: how was training?', 'client: knee hurts']);
  });

  it('after the transfer B sees nothing of A: no messages, previews, unread counts or notifications; A loses access', async () => {
    const { client, coachA, coachB } = await scenario();
    await transfer(coachA.id, coachB.id, client.id);

    expect((await as(coachB).messages.list({ clientId: client.id })).messages).toEqual([]);
    expect((await as(coachB).messages.list({ clientId: client.id, since: 0 })).messages).toEqual([]);
    expect((await as(coachB).messages.list({ clientId: client.id, before: Date.now() + 1 })).messages).toEqual([]);
    expect(await as(coachB).messages.coachThreadsSummary({})).toEqual([{ clientId: client.id, last: null, unreadForCoach: 0 }]);
    const feed = await as(coachB).notifications.list();
    expect(feed.notifications.filter((n) => n.type === 'message_received')).toEqual([]);
    expect(feed.unreadCount).toBe(0);

    expect((await reasonOf(as(coachA).messages.list({ clientId: client.id }))).code).toBe('FORBIDDEN');
    expect((await reasonOf(as(coachA).messages.send({ clientId: client.id, text: 'still there?' }))).code).toBe('FORBIDDEN');
    expect((await as(coachA).notifications.list()).notifications).toEqual([]);
  });

  it('the client keeps everything, each message tagged with its conversation; new messages go to B', async () => {
    const { client, coachA, coachB } = await scenario();
    await transfer(coachA.id, coachB.id, client.id);
    await tick();
    await as(coachB).messages.send({ clientId: client.id, text: 'B: welcome' });
    await tick();
    const viaDefault = await as(client).messages.send({ clientId: client.id, text: 'client: hi B' });
    expect(viaDefault.coachId).toBe(coachB.id);

    const all = (await as(client).messages.list({ clientId: client.id })).messages;
    expect(all.map((m) => [m.body, m.coachId ?? null])).toEqual([
      ['legacy from client', null],
      ['legacy from A', null],
      ['A: how was training?', coachA.id],
      ['client: knee hurts', coachA.id],
      ['B: welcome', coachB.id],
      ['client: hi B', coachB.id],
    ]);
    expect((await as(coachB).messages.list({ clientId: client.id })).messages.map((m) => m.body)).toEqual(['B: welcome', 'client: hi B']);
    const [summary] = await as(coachB).messages.coachThreadsSummary({});
    expect(summary.last?.body).toBe('client: hi B');
    expect(summary.unreadForCoach).toBe(1);
    const bFeed = (await as(coachB).notifications.list()).notifications.filter((n) => n.type === 'message_received');
    expect(bFeed.map((n) => n.body)).toEqual(['client: hi B']);
  });

  it('a queued message composed for A is refused after the transfer (never delivered to B); a delivered retry stays idempotent', async () => {
    const { client, coachA, coachB, toA } = await scenario();
    await transfer(coachA.id, coachB.id, client.id);
    expect(await reasonOf(as(client).messages.send({ clientId: client.id, text: 'queued for A', clientMsgId: 'op-2', coachId: coachA.id }))).toEqual({ code: 'CONFLICT', reason: 'CONVERSATION_CLOSED' });
    expect(await (await getDb()).collection('messages').countDocuments({ body: 'queued for A' })).toBe(0);
    // The op that WAS delivered before the transfer: its retry returns the original message, nothing new.
    const again = await as(client).messages.send({ clientId: client.id, text: 'client: knee hurts', clientMsgId: 'op-1', coachId: coachA.id });
    expect(again.id).toBe(toA.id);
    expect(again.coachId).toBe(coachA.id);
  });

  it("the client's earlier conversation is read-only; a coach acting on another conversation gets NOT_FOUND", async () => {
    const { client, coachA, coachB, toA } = await scenario();
    const aMsg = (await as(client).messages.list({ clientId: client.id })).messages.find((m) => m.body === 'A: how was training?')!;
    await transfer(coachA.id, coachB.id, client.id);

    expect(await reasonOf(as(client).messages.react({ clientId: client.id, id: aMsg.id, value: '👍' }))).toEqual({ code: 'FORBIDDEN', reason: 'CONVERSATION_CLOSED' });
    expect(await reasonOf(as(client).messages.edit({ clientId: client.id, id: toA.id, text: 'edited' }))).toEqual({ code: 'FORBIDDEN', reason: 'CONVERSATION_CLOSED' });
    expect(await reasonOf(as(client).messages.delete({ clientId: client.id, id: toA.id }))).toEqual({ code: 'FORBIDDEN', reason: 'CONVERSATION_CLOSED' });

    for (const call of [
      () => as(coachB).messages.react({ clientId: client.id, id: aMsg.id, value: '👍' }),
      () => as(coachB).messages.edit({ clientId: client.id, id: aMsg.id, text: 'x' }),
      () => as(coachB).messages.delete({ clientId: client.id, id: aMsg.id }),
    ]) {
      expect((await reasonOf(call())).code).toBe('NOT_FOUND');
    }
    const untouched = await (await getDb()).collection<MessageDoc>('messages').findOne({ _id: aMsg.id });
    expect(untouched?.reactions).toBeUndefined();
    expect(untouched?.deletedAt).toBeUndefined();

    // In the current conversation the client can still react.
    const bMsg = await as(coachB).messages.send({ clientId: client.id, text: 'B: hi' });
    expect((await as(client).messages.react({ clientId: client.id, id: bMsg.id, value: '👍' })).reactions).toEqual({ [client.id]: '👍' });
  });

  it("B's markRead only marks B's conversation", async () => {
    const { client, coachA, coachB } = await scenario();
    await transfer(coachA.id, coachB.id, client.id);
    await as(client).messages.send({ clientId: client.id, text: 'to B' });
    const res = await as(coachB).messages.markRead({ clientId: client.id });
    expect(res.updated).toBe(1);
    const toA = await (await getDb()).collection<MessageDoc>('messages').findOne({ body: 'client: knee hurts' });
    expect(toA?.seenAt).toBeNull();
  });

  it('an admin with clients.writeAll sees every message, legacy ones included (the documented fallback)', async () => {
    const { client, coachA, coachB, superAdmin } = await scenario();
    await transfer(coachA.id, coachB.id, client.id);
    expect((await as(superAdmin).messages.list({ clientId: client.id })).messages).toHaveLength(4);
  });

  it('a client with no coach keeps reading their history but cannot send (no conversation to write to)', async () => {
    const { client, coachA } = await scenario();
    await (await getDb()).collection('coachClients').updateOne({ _id: `${coachA.id}__${client.id}` } as never, { $set: { status: 'ended', endedAt: Date.now(), endReason: 'released' } });
    await (await getDb()).collection('users').updateOne({ _id: client.id } as never, { $unset: { assignedCoachId: '' } });
    expect((await as(client).messages.list({ clientId: client.id })).messages).toHaveLength(4);
    expect(await reasonOf(as(client).messages.send({ clientId: client.id, text: 'anyone?' }))).toEqual({ code: 'CONFLICT', reason: 'NO_ACTIVE_COACH' });
  });

  it('a coach-bound notification belongs to the coach it was raised for (legacy rows only from the current relationship on)', async () => {
    const { client, coachA, coachB } = await scenario();
    // A legacy row (no coachId) from before B's relationship, and one after it.
    const notifications = (await getDb()).collection('notifications');
    await notifications.insertOne({ _id: 'legacy-old', clientId: client.id, forRole: 'coach', type: 'checkin_submitted', seenAt: null, createdAt: Date.now() - 3_600_000, createdBy: client.id, updatedAt: 1 } as never);
    await transfer(coachA.id, coachB.id, client.id);
    await notifications.insertOne({ _id: 'legacy-new', clientId: client.id, forRole: 'coach', type: 'checkin_submitted', seenAt: null, createdAt: Date.now() + 1000, createdBy: client.id, updatedAt: 1 } as never);
    const ids = (await as(coachB).notifications.list()).notifications.map((n) => n.id);
    expect(ids).toContain('legacy-new');
    expect(ids).not.toContain('legacy-old');
    await expect(as(coachB).notifications.markRead({ id: 'legacy-old' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('B3-S04 — suspended accounts read, never write', () => {
  it('a suspended coach with an active relationship can list / summarize / markRead but not send, edit, delete or react', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a', role: 'coach' });
    await relate(coach.id, client.id);
    const own = await as(coach).messages.send({ clientId: client.id, text: 'before suspension' });
    await as(client).messages.send({ clientId: client.id, text: 'from client' });
    const suspended: AuthedUser = { ...coach, accountStatus: 'suspended' };

    expect((await as(suspended).messages.list({ clientId: client.id })).messages).toHaveLength(2);
    expect(await as(suspended).messages.coachThreadsSummary({})).toHaveLength(1);
    await expect(as(suspended).messages.markRead({ clientId: client.id })).resolves.toMatchObject({ ok: true });
    for (const call of [
      () => as(suspended).messages.send({ clientId: client.id, text: 'nope' }),
      () => as(suspended).messages.edit({ clientId: client.id, id: own.id, text: 'nope' }),
      () => as(suspended).messages.delete({ clientId: client.id, id: own.id }),
      () => as(suspended).messages.react({ clientId: client.id, id: own.id, value: '👍' }),
    ]) {
      expect(await reasonOf(call())).toEqual({ code: 'FORBIDDEN', reason: 'ACCOUNT_NOT_ACTIVE' });
    }
    expect(await (await getDb()).collection('messages').countDocuments({})).toBe(2);
  });

  it('every non-active status is read-only; an unrelated suspended user just gets FORBIDDEN (no reason)', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a', role: 'coach' });
    const stranger = await insertUser({ _id: 'coach-z', role: 'coach', accountStatus: 'suspended' });
    await relate(coach.id, client.id);
    for (const accountStatus of ['suspended', 'disabled', 'pending'] as const) {
      expect(await reasonOf(as({ ...client, accountStatus }).messages.send({ clientId: client.id, text: 'x' }))).toEqual({ code: 'FORBIDDEN', reason: 'ACCOUNT_NOT_ACTIVE' });
    }
    expect(await reasonOf(as(stranger).messages.send({ clientId: client.id, text: 'x' }))).toEqual({ code: 'FORBIDDEN', reason: undefined });
  });
});

describe('message attachments follow the same rules (media policy)', () => {
  const meta = (o: Record<string, unknown> = {}) => ({ category: 'message', mimeType: 'image/png', size: 100, clientId: 'client-1', ...o });

  it('a suspended account cannot upload; a client uploads only into the CURRENT conversation', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a', role: 'coach' });
    const coachB = await insertUser({ _id: 'coach-b', role: 'coach' });
    await relate(coachA.id, client.id);
    await expect(resolveUploadTarget(client, meta())).resolves.toMatchObject({ category: 'message' });
    await expect(resolveUploadTarget(client, meta({ coachId: coachA.id }))).resolves.toMatchObject({ category: 'message' });
    await expect(resolveUploadTarget({ ...client, accountStatus: 'suspended' }, meta())).rejects.toMatchObject({ status: 403 });
    await expect(resolveUploadTarget({ ...coachA, accountStatus: 'suspended' }, meta())).rejects.toMatchObject({ status: 403 });

    await transfer(coachA.id, coachB.id, client.id);
    await expect(resolveUploadTarget(client, meta({ coachId: coachA.id }))).rejects.toMatchObject({ status: 403 });
    await expect(resolveUploadTarget(coachA, meta())).rejects.toMatchObject({ status: 403 });
    await expect(resolveUploadTarget(coachB, meta())).resolves.toMatchObject({ category: 'message' });

    await (await getDb()).collection('coachClients').updateOne({ _id: `${coachB.id}__${client.id}` } as never, { $set: { status: 'ended' } });
    await expect(resolveUploadTarget(client, meta())).rejects.toMatchObject({ status: 403 });
  });
});
