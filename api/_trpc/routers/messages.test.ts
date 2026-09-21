import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import type { MessageDoc } from '../../messages/_data.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
}, 60_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  const db = await getDb();
  await db.dropDatabase();
});

function userDoc(overrides: Partial<UserDoc>): UserDoc {
  const now = Date.now();
  return {
    _id: 'user-1',
    email: 'a@example.com',
    emailLower: 'a@example.com',
    passwordHash: 'irrelevant-for-these-tests',
    displayName: 'Test User',
    role: 'coach',
    accountStatus: 'active',
    permissions: [],
    featureFlags: {},
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function authedUser(overrides: Partial<UserDoc>): AuthedUser {
  const doc = userDoc(overrides);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

function ctxFor(user: AuthedUser | null): Context {
  return { req: {} as VercelRequest, res: { setHeader: () => undefined } as unknown as VercelResponse, user };
}

const client = authedUser({ _id: 'client-1', role: 'client' });
const assignedCoach = authedUser({ _id: 'coach-1', role: 'coach' });
const otherCoach = authedUser({ _id: 'coach-2', role: 'coach' });
// Plain 'admin' only has clients.readAll, not clients.writeAll (see api/_lib/rbac.ts) —
// thread access requires the latter, which only super_admin (or an explicit grant) carries.
const admin = authedUser({ _id: 'admin-1', role: 'admin' });
const superAdmin = authedUser({ _id: 'super-admin-1', role: 'super_admin' });

async function assignCoach(coachId: string, clientId: string) {
  const db = await getDb();
  const doc: CoachClientDoc = {
    _id: `${coachId}__${clientId}`,
    coachId,
    clientId,
    status: 'active',
    createdBy: coachId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.collection<CoachClientDoc>('coachClients').insertOne(doc);
}

describe('messages router', () => {
  it('the client and their assigned coach can both read/send in the thread', async () => {
    await assignCoach(assignedCoach.id, client.id);

    const asClient = appRouter.createCaller(ctxFor(client));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));

    await asClient.messages.send({ clientId: client.id, text: 'Hi coach' });
    await asCoach.messages.send({ clientId: client.id, text: 'Hi there' });

    const page = await asClient.messages.list({ clientId: client.id });
    expect(page.messages.map((m) => m.body)).toEqual(['Hi coach', 'Hi there']);
  });

  it('a suspended client can still send/list/markRead in their own thread — matches the old REST index.ts/mark-read.ts, which never checked accountStatus at all', async () => {
    const suspendedClient = authedUser({ _id: 'client-2', role: 'client', accountStatus: 'suspended' });
    await assignCoach(assignedCoach.id, suspendedClient.id);
    const asSuspendedClient = appRouter.createCaller(ctxFor(suspendedClient));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));

    await asSuspendedClient.messages.send({ clientId: suspendedClient.id, text: 'Still here' });
    await asCoach.messages.send({ clientId: suspendedClient.id, text: 'Reply' });
    const page = await asSuspendedClient.messages.list({ clientId: suspendedClient.id });
    expect(page.messages).toHaveLength(2);
    await expect(asSuspendedClient.messages.markRead({ clientId: suspendedClient.id })).resolves.toMatchObject({ ok: true });
  });

  it('rejects an unrelated coach from reading or sending in the thread', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asOtherCoach = appRouter.createCaller(ctxFor(otherCoach));
    await expect(asOtherCoach.messages.list({ clientId: client.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asOtherCoach.messages.send({ clientId: client.id, text: 'nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a super_admin (has clients.writeAll) can access any thread', async () => {
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    await expect(asSuperAdmin.messages.list({ clientId: client.id })).resolves.toMatchObject({ messages: [] });
  });

  it('a plain admin (clients.readAll only, not writeAll) cannot access an unrelated thread', async () => {
    const asAdmin = appRouter.createCaller(ctxFor(admin));
    await expect(asAdmin.messages.list({ clientId: client.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sending a message raises a notification for the other party', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.messages.send({ clientId: client.id, text: 'Ping' });

    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));
    const { notifications, unreadCount } = await asCoach.notifications.list();
    expect(unreadCount).toBe(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('message_received');
    expect(notifications[0].clientId).toBe(client.id);
  });

  it('markRead clears both the message seenAt and the raised notification', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));

    await asClient.messages.send({ clientId: client.id, text: 'Ping' });
    expect((await asCoach.notifications.list()).unreadCount).toBe(1);

    await asCoach.messages.markRead({ clientId: client.id });

    const page = await asCoach.messages.list({ clientId: client.id });
    expect(page.messages[0].seenAt).not.toBeNull();
    expect((await asCoach.notifications.list()).unreadCount).toBe(0);
  });

  it('coachThreadsSummary aggregates last message + unread-for-coach across every active client, one row per client, and rejects an unrelated coach', async () => {
    const clientB = authedUser({ _id: 'client-2b', role: 'client' });
    await assignCoach(assignedCoach.id, client.id);
    await assignCoach(assignedCoach.id, clientB.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));

    await asClient.messages.send({ clientId: client.id, text: 'first' });
    await asClient.messages.send({ clientId: client.id, text: 'second (unread)' });
    await asCoach.messages.send({ clientId: clientB.id, text: 'coach said hi' }); // no unread for the coach here

    const rows = await asCoach.messages.coachThreadsSummary({});
    expect(rows).toHaveLength(2);
    const byClient = new Map(rows.map((r) => [r.clientId, r]));
    expect(byClient.get(client.id)?.last?.body).toBe('second (unread)');
    expect(byClient.get(client.id)?.unreadForCoach).toBe(2);
    expect(byClient.get(clientB.id)?.last?.body).toBe('coach said hi');
    expect(byClient.get(clientB.id)?.unreadForCoach).toBe(0);

    // Marking one thread read drops only that thread's count.
    await asCoach.messages.markRead({ clientId: client.id });
    const after = await asCoach.messages.coachThreadsSummary({});
    expect(after.find((r) => r.clientId === client.id)?.unreadForCoach).toBe(0);

    // An unrelated coach may not read another coach's summary.
    const asOtherCoach = appRouter.createCaller(ctxFor(otherCoach));
    await expect(asOtherCoach.messages.coachThreadsSummary({ coachId: assignedCoach.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // A super_admin (clients.writeAll) may read any coach's summary.
    const asSuperAdmin = appRouter.createCaller(ctxFor(superAdmin));
    await expect(asSuperAdmin.messages.coachThreadsSummary({ coachId: assignedCoach.id })).resolves.toHaveLength(2);
  });

  it('send returns the created message with a stable id', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'Hello' });
    expect(sent.id).toBeTruthy();
    expect(sent.body).toBe('Hello');
  });

  it('retrying a send with the same clientMsgId is idempotent — no duplicate is created', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const first = await asClient.messages.send({ clientId: client.id, text: 'Retry me', clientMsgId: 'local-abc' });
    const second = await asClient.messages.send({ clientId: client.id, text: 'Retry me', clientMsgId: 'local-abc' });
    expect(second.id).toBe(first.id);

    const page = await asClient.messages.list({ clientId: client.id });
    expect(page.messages).toHaveLength(1);
  });

  it('two messages with identical text but different clientMsgId remain distinct', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.messages.send({ clientId: client.id, text: 'same text', clientMsgId: 'local-1' });
    await asClient.messages.send({ clientId: client.id, text: 'same text', clientMsgId: 'local-2' });

    const page = await asClient.messages.list({ clientId: client.id });
    expect(page.messages).toHaveLength(2);
    expect(page.messages[0].id).not.toBe(page.messages[1].id);
  });

  it('the sender can edit their own message within the 2-minute window, and it is marked edited', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'Oops typo' });

    const updated = await asClient.messages.edit({ clientId: client.id, id: sent.id, text: 'Fixed' });
    expect(updated.body).toBe('Fixed');
    expect(updated.editedAt).toBeTruthy();
    expect(updated.createdAt).toBe(sent.createdAt); // timestamp of the original send is preserved
  });

  it('edit is rejected past the 2-minute window, even though the client UI would already hide the action', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'Old message' });

    // Simulate age by rewinding the stored createdAt — the server checks its
    // own DB timestamp, not anything the client could spoof.
    const db = await getDb();
    await db.collection<MessageDoc>('messages').updateOne({ _id: sent.id }, { $set: { createdAt: Date.now() - 3 * 60 * 1000 } });

    await expect(asClient.messages.edit({ clientId: client.id, id: sent.id, text: 'Too late' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('only the sender can edit or delete their own message — the other party in the same thread cannot', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'Client said this' });

    await expect(asCoach.messages.edit({ clientId: client.id, id: sent.id, text: 'Coach rewrites it' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asCoach.messages.delete({ clientId: client.id, id: sent.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('delete within the window soft-deletes: body/attachment are redacted but the row remains (for audit) and chronology is stable', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.messages.send({ clientId: client.id, text: 'before' });
    const toDelete = await asClient.messages.send({ clientId: client.id, text: 'delete me' });
    await asClient.messages.send({ clientId: client.id, text: 'after' });

    const deleted = await asClient.messages.delete({ clientId: client.id, id: toDelete.id });
    expect(deleted.body).toBe('');
    expect(deleted.deletedAt).toBeTruthy();

    const page = await asClient.messages.list({ clientId: client.id });
    expect(page.messages.map((m) => m.body)).toEqual(['before', '', 'after']); // order preserved, middle one redacted

    // The row itself is still in Mongo (soft-delete, not a hard delete) — audit trail intact.
    const db = await getDb();
    const raw = await db.collection<MessageDoc>('messages').findOne({ _id: toDelete.id });
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).toBeTruthy();
  });

  it('delete is rejected past the 2-minute window', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'Old' });
    const db = await getDb();
    await db.collection<MessageDoc>('messages').updateOne({ _id: sent.id }, { $set: { createdAt: Date.now() - 3 * 60 * 1000 } });
    await expect(asClient.messages.delete({ clientId: client.id, id: sent.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reactions: add, replace, and remove — either party in the thread may react, one reaction per user', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const asCoach = appRouter.createCaller(ctxFor(assignedCoach));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'React to this' });

    const liked = await asCoach.messages.react({ clientId: client.id, id: sent.id, value: '👍' });
    expect(liked.reactions).toEqual({ [assignedCoach.id]: '👍' });

    const replaced = await asCoach.messages.react({ clientId: client.id, id: sent.id, value: '❤️' });
    expect(replaced.reactions).toEqual({ [assignedCoach.id]: '❤️' });

    const both = await asClient.messages.react({ clientId: client.id, id: sent.id, value: '🙏' });
    expect(both.reactions).toEqual({ [assignedCoach.id]: '❤️', [client.id]: '🙏' });

    const removed = await asCoach.messages.react({ clientId: client.id, id: sent.id, value: null });
    expect(removed.reactions).toEqual({ [client.id]: '🙏' });
  });

  it('rejects a reaction value outside the allowed set', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'React to this' });
    await expect(asClient.messages.react({ clientId: client.id, id: sent.id, value: '🍕' as never })).rejects.toBeTruthy();
  });

  it('an unrelated coach cannot edit, delete, or react in a thread they do not belong to', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const asOtherCoach = appRouter.createCaller(ctxFor(otherCoach));
    const sent = await asClient.messages.send({ clientId: client.id, text: 'private thread' });

    await expect(asOtherCoach.messages.edit({ clientId: client.id, id: sent.id, text: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asOtherCoach.messages.delete({ clientId: client.id, id: sent.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(asOtherCoach.messages.react({ clientId: client.id, id: sent.id, value: '👍' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('list with `before` pages backward without disturbing the forward `since` cursor behavior', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    for (let i = 0; i < 5; i++) await asClient.messages.send({ clientId: client.id, text: `msg ${i}` });

    const all = await asClient.messages.list({ clientId: client.id });
    const midpoint = all.messages[2].createdAt;
    const older = await asClient.messages.list({ clientId: client.id, before: midpoint });
    expect(older.messages.map((m) => m.body)).toEqual(['msg 0', 'msg 1']);
  });

  // Regression coverage: an attachment's `mimeType` must survive `send` -> `list`
  // unmangled, for every kind the composer can produce, so the frontend's
  // media-type classifier has real data to work with instead of falling back.
  it.each([
    ['image', 'image/png', 'photo.png'],
    ['image', 'image/jpeg', 'photo.jpg'],
    ['image', 'image/svg+xml', 'icon.svg'],
    ['video', 'video/mp4', 'clip.mp4'],
    ['audio', 'audio/webm', 'voice.webm'],
    ['file', 'application/pdf', 'invoice.pdf'],
  ] as const)('persists attachment metadata (kind=%s, mimeType=%s) through send -> list', async (kind, mimeType, name) => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    const sent = await asClient.messages.send({
      clientId: client.id,
      text: kind === 'image' ? 'check this out' : '',
      attachment: { url: 'https://cdn.example/forma/x', kind, name, size: 4096, mimeType },
    });
    expect(sent.attachment).toEqual({ url: 'https://cdn.example/forma/x', kind, name, size: 4096, mimeType });

    const page = await asClient.messages.list({ clientId: client.id });
    expect(page.messages.at(-1)?.attachment).toEqual({ url: 'https://cdn.example/forma/x', kind, name, size: 4096, mimeType });
  });

  it('an older message with an attachment but no `mimeType` (pre-migration) still lists without error, with `mimeType` simply absent', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const db = await getDb();
    const now = Date.now();
    const legacyDoc: MessageDoc = {
      _id: 'msg_legacy_1',
      clientId: client.id,
      fromUserId: client.id,
      fromRole: 'client',
      body: '',
      attachment: { url: 'https://cdn.example/forma/legacy.svg', kind: 'file', name: 'legacy.svg', size: 2048 },
      seenAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<MessageDoc>('messages').insertOne(legacyDoc);

    const asClient = appRouter.createCaller(ctxFor(client));
    const page = await asClient.messages.list({ clientId: client.id });
    const legacy = page.messages.find((m) => m.id === 'msg_legacy_1');
    expect(legacy?.attachment).toEqual({ url: 'https://cdn.example/forma/legacy.svg', kind: 'file', name: 'legacy.svg', size: 2048 });
    expect(legacy?.attachment?.mimeType).toBeUndefined();
  });
});

describe('notifications router', () => {
  it('a client with no coach sees an empty feed', async () => {
    const asClient = appRouter.createCaller(ctxFor(client));
    expect(await asClient.notifications.list()).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('works for a suspended client too — matches the old REST notifications-index.ts (bare requireUser)', async () => {
    const suspendedClient = authedUser({ _id: 'client-3', role: 'client', accountStatus: 'suspended' });
    const asSuspendedClient = appRouter.createCaller(ctxFor(suspendedClient));
    expect(await asSuspendedClient.notifications.list()).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('an admin (no notifications feed) always sees an empty feed', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.messages.send({ clientId: client.id, text: 'Hi' });

    const asAdmin = appRouter.createCaller(ctxFor(admin));
    expect(await asAdmin.notifications.list()).toEqual({ notifications: [], unreadCount: 0 });
  });

  it('markRead by id throws NOT_FOUND for an id outside the caller\'s own feed', async () => {
    await assignCoach(assignedCoach.id, client.id);
    const asClient = appRouter.createCaller(ctxFor(client));
    await asClient.messages.send({ clientId: client.id, text: 'Hi' }); // raises a notification for the coach, not the client

    const asOtherCoach = appRouter.createCaller(ctxFor(otherCoach));
    // otherCoach has no notifications at all, so any id is "not found" from their feed's perspective.
    await expect(asOtherCoach.notifications.markRead({ id: 'does-not-exist' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
