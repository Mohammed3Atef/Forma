import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import type { UserDoc } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';

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
