import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import type { MessageDoc } from '../../messages/_data.js';

/**
 * B3.6 coach messaging — the server contracts the rebuilt screens rely on
 * (the router is unchanged except the attachment URL check):
 *  - a coach's message queued before a transfer is refused afterwards and
 *    reaches nobody (never redirected to the new coach); same for the client;
 *  - broadcast = one `send` per recipient with its own `clientMsgId`: retries
 *    never duplicate, a transferred recipient is refused, the rest delivered;
 *  - an ended relationship / a suspended coach cannot write;
 *  - attachment URLs must be web URLs.
 */
let mongod: MongoMemoryServer;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b36_messaging';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});
beforeEach(async () => {
  await (await getDb()).dropDatabase();
});

async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'coach', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const ctxFor = (user: AuthedUser): Context => ({ req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user });
const as = (u: AuthedUser) => appRouter.createCaller(ctxFor(u));
const outcome = async (p: Promise<unknown>): Promise<{ code: string; reason?: string }> => {
  try {
    await p;
    return { code: 'OK' };
  } catch (e) {
    const err = e as { code?: string; cause?: { reason?: string } };
    return { code: String(err.code), reason: err.cause?.reason };
  }
};
async function relate(coachId: string, clientId: string) {
  const now = Date.now() - 60_000;
  await (await getDb()).collection<CoachClientDoc>('coachClients').insertOne({ _id: `${coachId}__${clientId}`, coachId, clientId, status: 'active', createdBy: coachId, createdAt: now, updatedAt: now });
  await (await getDb()).collection<UserDoc>('users').updateOne({ _id: clientId }, { $set: { assignedCoachId: coachId } });
}
async function transfer(fromCoach: string, toCoach: string, clientId: string) {
  const now = Date.now();
  const col = (await getDb()).collection<CoachClientDoc>('coachClients');
  await col.updateOne({ _id: `${fromCoach}__${clientId}` }, { $set: { status: 'ended', endedAt: now, endReason: 'transferred', mode: 'keep_plans', updatedAt: now } });
  await col.insertOne({ _id: `${toCoach}__${clientId}`, coachId: toCoach, clientId, status: 'active', createdBy: 'admin', createdAt: now, updatedAt: now });
  await (await getDb()).collection<UserDoc>('users').updateOne({ _id: clientId }, { $set: { assignedCoachId: toCoach } });
}
const allMessages = async (clientId: string) => (await getDb()).collection<MessageDoc>('messages').find({ clientId }).sort({ createdAt: 1 }).toArray();

describe('a message queued before a transfer is never redirected (B3-S14, B3.6)', () => {
  it("coach A's queued message, retried by the outbox after A → B, is refused and reaches nobody", async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a' });
    const coachB = await insertUser({ _id: 'coach-b' });
    await relate(coachA.id, client.id);
    await as(coachA).messages.send({ clientId: client.id, text: 'A: before', clientMsgId: 'op-a1', coachId: coachA.id });
    await transfer(coachA.id, coachB.id, client.id);

    // The outbox replays exactly what was queued: same op id, the conversation it was written in.
    expect(await outcome(as(coachA).messages.send({ clientId: client.id, text: 'A: queued offline', clientMsgId: 'op-a2', coachId: coachA.id }))).toEqual({ code: 'FORBIDDEN', reason: undefined });
    // Even an old build that sends no conversation id cannot get through.
    expect((await outcome(as(coachA).messages.send({ clientId: client.id, text: 'A: legacy op', clientMsgId: 'op-a3' }))).code).toBe('FORBIDDEN');

    const bodies = (await allMessages(client.id)).map((m) => m.body);
    expect(bodies).toEqual(['A: before']);
    expect((await as(coachB).messages.list({ clientId: client.id })).messages).toEqual([]);
    const [summary] = await as(coachB).messages.coachThreadsSummary({});
    expect(summary).toEqual({ clientId: client.id, last: null, unreadForCoach: 0 });
    // A no longer reads the thread, and its summary no longer lists the client.
    expect((await outcome(as(coachA).messages.list({ clientId: client.id }))).code).toBe('FORBIDDEN');
    expect(await as(coachA).messages.coachThreadsSummary({})).toEqual([]);
  });

  it("the client's message queued for A is refused after the transfer (CONVERSATION_CLOSED), not delivered to B", async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coachA = await insertUser({ _id: 'coach-a' });
    const coachB = await insertUser({ _id: 'coach-b' });
    await relate(coachA.id, client.id);
    await transfer(coachA.id, coachB.id, client.id);
    expect(await outcome(as(client).messages.send({ clientId: client.id, text: 'for A', clientMsgId: 'op-c1', coachId: coachA.id }))).toEqual({ code: 'CONFLICT', reason: 'CONVERSATION_CLOSED' });
    expect(await allMessages(client.id)).toEqual([]);
    expect((await as(coachB).messages.list({ clientId: client.id })).messages).toEqual([]);
  });
});

describe('broadcast: one idempotent send per recipient (MS-10 / B3-C08)', () => {
  it('each recipient gets one copy; a retry with the same keys never duplicates; a transferred recipient is refused', async () => {
    const coach = await insertUser({ _id: 'coach-a' });
    const other = await insertUser({ _id: 'coach-b' });
    const ids = ['c1', 'c2', 'c3'];
    for (const id of ids) {
      await insertUser({ _id: id, role: 'client' });
      await relate(coach.id, id);
    }
    await transfer(coach.id, other.id, 'c3');
    const key = (cid: string) => `bc_batch1_${cid}`;
    const sendAll = (recipients: string[]) =>
      Promise.all(recipients.map((cid) => outcome(as(coach).messages.send({ clientId: cid, text: 'Gym closed Friday', category: 'announcement', clientMsgId: key(cid), coachId: coach.id }))));

    expect((await sendAll(ids)).map((o) => o.code)).toEqual(['OK', 'OK', 'FORBIDDEN']);
    // "Retry failed" and a lost-answer retry of everyone: still one copy each.
    await sendAll(ids);
    await sendAll(['c1']);
    for (const cid of ['c1', 'c2']) {
      const rows = await allMessages(cid);
      expect(rows.map((m) => [m.body, m.category, m.clientMsgId, m.coachId])).toEqual([['Gym closed Friday', 'announcement', key(cid), coach.id]]);
    }
    expect(await allMessages('c3')).toEqual([]);
    // Each recipient's own notification, once.
    const notes = await (await getDb()).collection('notifications').find({ type: 'message_received' }).toArray();
    expect(notes.map((n) => n.clientId).sort()).toEqual(['c1', 'c2']);
  });
});

describe('write restrictions the thread screen reflects (O-17, ended relationships)', () => {
  it('a released relationship: the coach can no longer read, send, react or mark read', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a' });
    await relate(coach.id, client.id);
    const m = await as(client).messages.send({ clientId: client.id, text: 'hi coach' });
    await (await getDb()).collection<CoachClientDoc>('coachClients').updateOne({ _id: `${coach.id}__${client.id}` }, { $set: { status: 'ended', endedAt: Date.now(), endReason: 'released' } });
    for (const call of [
      () => as(coach).messages.list({ clientId: client.id }),
      () => as(coach).messages.send({ clientId: client.id, text: 'still here?' }),
      () => as(coach).messages.react({ clientId: client.id, id: m.id, value: '👍' }),
      () => as(coach).messages.markRead({ clientId: client.id }),
    ]) {
      expect((await outcome(call())).code).toBe('FORBIDDEN');
    }
    expect((await allMessages(client.id)).map((x) => x.body)).toEqual(['hi coach']);
  });

  it('a suspended coach reads and marks read, but every write — including a queued retry — is refused with ACCOUNT_NOT_ACTIVE', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a', accountStatus: 'suspended' });
    await relate(coach.id, client.id);
    await as(client).messages.send({ clientId: client.id, text: 'hello?' });
    expect((await as(coach).messages.list({ clientId: client.id })).messages).toHaveLength(1);
    expect((await as(coach).messages.markRead({ clientId: client.id })).updated).toBe(1);
    expect(await outcome(as(coach).messages.send({ clientId: client.id, text: 'queued', clientMsgId: 'op-1', coachId: coach.id }))).toEqual({ code: 'FORBIDDEN', reason: 'ACCOUNT_NOT_ACTIVE' });
    expect((await allMessages(client.id)).map((x) => x.body)).toEqual(['hello?']);
  });
});

describe('attachment URLs (B3.6 hardening)', () => {
  it('only web URLs are accepted; a javascript: or data: URL is refused', async () => {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a' });
    await relate(coach.id, client.id);
    for (const url of ['javascript:alert(document.cookie)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not a url', '//cdn.example/x.png']) {
      expect((await outcome(as(client).messages.send({ clientId: client.id, text: '', attachment: { url, kind: 'file', name: 'x.pdf' } }))).code, url).toBe('BAD_REQUEST');
    }
    expect(await allMessages(client.id)).toEqual([]);
    const ok = await as(client).messages.send({ clientId: client.id, text: '', attachment: { url: 'https://cdn.example/Forma/client-1/messages/a.png', kind: 'image', mimeType: 'image/png' } });
    expect(ok.attachment?.url).toBe('https://cdn.example/Forma/client-1/messages/a.png');
    await as(coach).messages.send({ clientId: client.id, text: '', attachment: { url: 'http://127.0.0.1:5299/cdn/x.pdf', kind: 'file' } });
    expect(await allMessages(client.id)).toHaveLength(2);
  });
});

describe('read receipts mean the ADDRESSEE read it (B3.6 certification)', () => {
  async function thread() {
    const client = await insertUser({ _id: 'client-1', role: 'client' });
    const coach = await insertUser({ _id: 'coach-a' });
    const admin = await insertUser({ _id: 'sa', role: 'super_admin' });
    await relate(coach.id, client.id);
    const fromCoach = await as(coach).messages.send({ clientId: client.id, text: 'coach → client', clientMsgId: 'op-c1', coachId: coach.id });
    const fromClient = await as(client).messages.send({ clientId: client.id, text: 'client → coach' });
    return { client, coach, admin, fromCoach, fromClient };
  }
  const seenOf = async (id: string) => ((await getDb()).collection<MessageDoc>('messages').findOne({ _id: id }).then((m) => m?.seenAt ?? null));

  it('sending never marks anything seen; the sender reading their own conversation never marks their own message seen', async () => {
    const { client, coach, fromCoach, fromClient } = await thread();
    expect(fromCoach.seenAt).toBeNull();
    expect(fromClient.seenAt).toBeNull();
    // The coach opens the conversation: only the client's message becomes seen.
    expect((await as(coach).messages.markRead({ clientId: client.id })).updated).toBe(1);
    expect(await seenOf(fromCoach.id)).toBeNull();
    expect(await seenOf(fromClient.id)).not.toBeNull();
    // An idempotent retry of the coach's send returns it still unseen.
    expect((await as(coach).messages.send({ clientId: client.id, text: 'coach → client', clientMsgId: 'op-c1', coachId: coach.id })).seenAt).toBeNull();
  });

  it("only the client's read marks the coach's message seen — an admin reading the thread records nothing", async () => {
    const { client, coach, admin, fromCoach, fromClient } = await thread();
    expect((await as(admin).messages.markRead({ clientId: client.id })).updated).toBe(0);
    expect(await seenOf(fromCoach.id)).toBeNull();
    expect(await seenOf(fromClient.id)).toBeNull();
    expect((await as(client).messages.markRead({ clientId: client.id })).updated).toBe(1);
    const seen = await seenOf(fromCoach.id);
    expect(seen).not.toBeNull();
    // What the coach's screen reads is exactly that server value.
    const [mine] = (await as(coach).messages.list({ clientId: client.id })).messages.filter((m) => m.id === fromCoach.id);
    expect(mine.seenAt).toBe(seen);
  });

  it("an admin message in the conversation is the client's to read, not the coach's", async () => {
    const { client, coach, admin } = await thread();
    const fromAdmin = await as(admin).messages.send({ clientId: client.id, text: 'admin → client' });
    await as(coach).messages.markRead({ clientId: client.id });
    expect(await seenOf(fromAdmin.id)).toBeNull();
    await as(client).messages.markRead({ clientId: client.id });
    expect(await seenOf(fromAdmin.id)).not.toBeNull();
  });
});
