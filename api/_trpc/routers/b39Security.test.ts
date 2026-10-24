import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * B39A-S01 (P0, fixed 2026-10-22) — password-reset poisoning. Emailed links (password reset, client
 * invites, welcome) are built on the TRUSTED origin only (`APP_BASE_URL`, or the built-in canonical
 * origin in production) — never on the request's `Origin`, `Host`, `X-Forwarded-Host` or
 * `Forwarded`, which an attacker controls. No trusted origin → nothing is sent and no reset token is
 * stored, and the reply never changes. Tokens and invite links never reach the logs.
 */
const sent = vi.hoisted(() => ({ reset: [] as { to: string; url: string }[], welcome: [] as { to: string; appUrl: string }[], invite: [] as { to: string; inviteUrl: string; appUrl: string }[] }));
vi.mock('../../_lib/email.js', async (orig) => ({
  ...(await orig<typeof import('../../_lib/email.js')>()),
  sendPasswordResetEmail: vi.fn(async (to: string, url: string) => void sent.reset.push({ to, url })),
  sendWelcomeEmail: vi.fn(async (to: string, _name: string, appUrl: string) => void sent.welcome.push({ to, appUrl })),
  sendClientInviteEmail: vi.fn(async (to: string, o: { inviteUrl: string; appUrl: string }) => void sent.invite.push({ to, inviteUrl: o.inviteUrl, appUrl: o.appUrl })),
}));

import { appRouter } from '../router.js';
import type { AuthedUser, Context } from '../context.js';
import { getDb } from '../../_lib/mongodb.js';
import { hashRawToken } from '../../_lib/tokens.js';
import type { UserDoc } from '../../_lib/types.js';
import { ensureCoachPlan } from '../../_lib/testFixtures.js';
import { resetAppUrlWarningForTests } from '../../_lib/appUrl.js';
import type { TRPCError } from '@trpc/server';
import { getErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { MESSAGE_SEND_LIMIT } from './messages.js';
import { INVITE_CREATE_LIMIT, INVITE_EMAIL_CEILING } from './invites.js';
import { sendClientInviteEmail } from '../../_lib/email.js';
import { enforceRateLimit, mailboxKey } from '../../_lib/rateLimit.js';

let mongod: MongoMemoryReplSet;
beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test_b39_security';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);
afterAll(async () => {
  await mongod.stop();
});

const ENV_KEYS = ['APP_BASE_URL', 'VERCEL_ENV', 'NODE_ENV'] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
let logs: string[] = [];
beforeEach(async () => {
  await (await getDb()).dropDatabase();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.APP_BASE_URL = 'https://app.forma.test';
  delete process.env.VERCEL_ENV;
  process.env.NODE_ENV = 'test';
  sent.reset = [];
  sent.welcome = [];
  sent.invite = [];
  logs = [];
  resetAppUrlWarningForTests();
  for (const level of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(' ')));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const FORGED = { origin: 'https://evil.example', host: 'evil.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', forwarded: 'for=1.2.3.4;host=evil.example;proto=https', referer: 'https://evil.example/reset' };
const callerWith = (headers: Record<string, string>, user: AuthedUser | null = null) =>
  appRouter.createCaller({ req: { headers, socket: { remoteAddress: '10.0.0.1' } } as unknown as VercelRequest, res: { setHeader: () => undefined, appendHeader: () => undefined } as unknown as VercelResponse, user } as Context);

async function insertUser(o: Partial<UserDoc>): Promise<AuthedUser> {
  const now = Date.now();
  const doc: UserDoc = { _id: 'u', email: `${o._id}@t.test`, emailLower: `${o._id}@t.test`, passwordHash: 'x', displayName: String(o._id), role: 'client', accountStatus: 'active', permissions: [], featureFlags: {}, createdBy: 'system', createdAt: now, updatedAt: now, ...o };
  await (await getDb()).collection<UserDoc>('users').insertOne(doc);
  if (doc.role === 'coach') await ensureCoachPlan(doc._id);
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}
const resets = async () => (await getDb()).collection('passwordResets').find({}).toArray();
const tokenOf = (url: string) => url.split('/reset/')[1];

describe('password reset links (B39A-S01)', () => {
  it('forged Origin, Host, X-Forwarded-Host and Forwarded headers never reach the link — it is on the configured origin; the token is stored only as its hash', async () => {
    await insertUser({ _id: 'victim' });
    await expect(callerWith(FORGED).auth.requestPasswordReset({ email: 'victim@t.test' })).resolves.toEqual({ ok: true });
    expect(sent.reset).toHaveLength(1);
    const { url } = sent.reset[0];
    expect(url.startsWith('https://app.forma.test/reset/')).toBe(true);
    expect(url).not.toMatch(/evil/);
    const stored = await resets();
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(hashRawToken(tokenOf(url)));
    expect(JSON.stringify(stored)).not.toContain(tokenOf(url)); // only the hash is stored
  });

  it('no Origin header at all: the same trusted link', async () => {
    await insertUser({ _id: 'victim' });
    await callerWith({}).auth.requestPasswordReset({ email: 'victim@t.test' });
    expect(sent.reset[0].url.startsWith('https://app.forma.test/reset/')).toBe(true);
  });

  it('production: the configured origin; or, with none configured, the built-in canonical origin — never a request value', async () => {
    await insertUser({ _id: 'victim' });
    process.env.VERCEL_ENV = 'production';
    process.env.APP_BASE_URL = 'https://www.useforma.fit';
    await callerWith(FORGED).auth.requestPasswordReset({ email: 'victim@t.test' });
    delete process.env.APP_BASE_URL;
    await callerWith(FORGED).auth.requestPasswordReset({ email: 'victim@t.test' });
    expect(sent.reset.map((s) => s.url.split('/reset/')[0])).toEqual(['https://www.useforma.fit', 'https://www.useforma.fit']);
  });

  it('an invalid or missing trusted origin fails safe: nothing sent, no token stored, the same reply', async () => {
    await insertUser({ _id: 'victim' });
    const cases: [Record<string, string | undefined>, string][] = [
      [{ APP_BASE_URL: 'https://evil.example/path', VERCEL_ENV: 'production' }, 'path'],
      [{ APP_BASE_URL: 'http://app.forma.test', VERCEL_ENV: 'production' }, 'http in production'],
      [{ APP_BASE_URL: 'javascript:alert(1)' }, 'scheme'],
      [{ APP_BASE_URL: 'not a url' }, 'garbage'],
      [{ APP_BASE_URL: undefined, VERCEL_ENV: 'preview' }, 'missing on a preview'],
      [{ APP_BASE_URL: undefined }, 'missing outside production'],
    ];
    for (const [env, label] of cases) {
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await (await getDb()).collection('rateLimits').deleteMany({}); // each case is its own request window
      await expect(callerWith(FORGED).auth.requestPasswordReset({ email: 'victim@t.test' }), label).resolves.toEqual({ ok: true });
      delete process.env.VERCEL_ENV;
    }
    expect(sent.reset).toEqual([]);
    expect(await resets()).toEqual([]);
  });

  it('an unknown email: the same reply, nothing sent or stored (no enumeration)', async () => {
    await expect(callerWith(FORGED).auth.requestPasswordReset({ email: 'nobody@t.test' })).resolves.toEqual({ ok: true });
    expect(sent.reset).toEqual([]);
    expect(await resets()).toEqual([]);
  });

  it('the emailed token resets the password exactly once; the token and the link are never logged', async () => {
    await insertUser({ _id: 'victim' });
    await callerWith(FORGED).auth.requestPasswordReset({ email: 'victim@t.test' });
    const raw = tokenOf(sent.reset[0].url);
    await expect(callerWith({}).auth.confirmPasswordReset({ token: raw, newPassword: 'a-new-password-1' })).resolves.toBeTruthy();
    await expect(callerWith({}).auth.confirmPasswordReset({ token: raw, newPassword: 'another-password-2' })).rejects.toMatchObject({ code: expect.any(String) });
    expect(logs.join('\n')).not.toContain(raw);
    expect(logs.join('\n')).not.toMatch(/\/reset\//);
  });
});

describe('invite and welcome links (B39A-S01)', () => {
  it('an invite email links to the trusted origin whatever the request says; the code is not logged', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const inv = await callerWith(FORGED, coach).invites.create({ email: 'new@t.test', displayName: 'New' });
    expect(sent.invite).toEqual([{ to: 'new@t.test', inviteUrl: `https://app.forma.test/invite/${inv._id}`, appUrl: 'https://app.forma.test' }]);
    expect(logs.join('\n')).not.toContain(inv._id);
  });

  it('an invite with no trusted origin is still created (the code is shown in the app) but no email is sent', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    process.env.APP_BASE_URL = 'https://evil.example/x';
    const inv = await callerWith(FORGED, coach).invites.create({ email: 'new@t.test' });
    expect(inv._id).toBeTruthy();
    expect(sent.invite).toEqual([]);
  });

  it('welcome emails (coach sign-up, invite claim) use the trusted origin too', async () => {
    await callerWith(FORGED).auth.signup({ email: 'newcoach@t.test', password: 'long-enough-1', displayName: 'New Coach', role: 'coach' });
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const inv = await callerWith({}, coach).invites.create({ email: 'claimer@t.test' });
    await callerWith(FORGED).invites.claim({ code: inv._id, phone: '+201000000000', password: 'long-enough-1' });
    expect(sent.welcome.map((w) => w.appUrl)).toEqual(['https://app.forma.test', 'https://app.forma.test']);
  });
});

/**
 * B36-R4 (P1, release-blocking) — server-side rate limits on `messages.send` and `invites.create`.
 * Shared by every server instance (one atomic counter per window in Mongo), checked after the
 * idempotent replay (a retried, already-delivered message never counts), after authorization, and
 * refused with `TOO_MANY_REQUESTS` + `reason: RATE_LIMITED` + `retryAfter` seconds.
 */
describe('message and invite rate limits (B36-R4)', () => {
  async function thread() {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const client = await insertUser({ _id: 'client-1', role: 'client', assignedCoachId: 'coach-1' });
    const client2 = await insertUser({ _id: 'client-2', role: 'client', assignedCoachId: 'coach-1' });
    const now = Date.now();
    for (const c of ['client-1', 'client-2']) await (await getDb()).collection('coachClients').insertOne({ _id: `coach-1__${c}` as never, coachId: 'coach-1', clientId: c, status: 'active', createdBy: 'coach-1', createdAt: now, updatedAt: now });
    return { coach, client, client2 };
  }
  const send = (u: AuthedUser, clientId: string, i: number, extra: Record<string, unknown> = {}) => callerWith({}, u).messages.send({ clientId, text: `m${i}`, clientMsgId: `cm-${u.id}-${clientId}-${i}`, ...(u.role === 'coach' ? { coachId: 'coach-1' } : {}), ...extra });
  const stored = async (clientId: string) => (await getDb()).collection('messages').countDocuments({ clientId });
  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      const err = e as TRPCError & { cause?: { reason?: string; retryAfter?: number } };
      return { code: err.code, reason: err.cause?.reason, retryAfter: err.cause?.retryAfter, wire: getErrorShape({ config: appRouter._def._config, error: err, type: 'mutation', path: 'messages.send', input: undefined, ctx: undefined }) };
    }
  };

  it('per conversation: 60 in the window, the 61st refused with RATE_LIMITED + retryAfter (on the wire too) and not stored; other conversations unaffected', async () => {
    const { coach } = await thread();
    for (let i = 0; i < MESSAGE_SEND_LIMIT.perConversation; i += 1) await send(coach, 'client-1', i);
    const r = await refusal(send(coach, 'client-1', 999));
    expect(r).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(r!.retryAfter).toBeGreaterThan(0);
    expect(r!.retryAfter).toBeLessThanOrEqual(MESSAGE_SEND_LIMIT.windowMs / 1000);
    expect((r!.wire as { data: Record<string, unknown> }).data).toMatchObject({ reason: 'RATE_LIMITED', retryAfter: r!.retryAfter, httpStatus: 429 });
    expect(await stored('client-1')).toBe(MESSAGE_SEND_LIMIT.perConversation);
    await expect(send(coach, 'client-2', 0)).resolves.toBeTruthy();
  });

  it('a retried, already-delivered message is acknowledged even when the window is full (the outbox never loses or duplicates it)', async () => {
    const { coach } = await thread();
    const first = await send(coach, 'client-1', 0);
    for (let i = 1; i < MESSAGE_SEND_LIMIT.perConversation; i += 1) await send(coach, 'client-1', i);
    expect(await refusal(send(coach, 'client-1', 999))).toMatchObject({ reason: 'RATE_LIMITED' });
    const replay = await send(coach, 'client-1', 0);
    expect(replay.id).toBe(first.id);
    expect(await stored('client-1')).toBe(MESSAGE_SEND_LIMIT.perConversation);
  });

  it('concurrent sends are counted exactly: 70 at once into one conversation → 60 stored, 10 refused', async () => {
    const { coach } = await thread();
    const results = await Promise.allSettled(Array.from({ length: 70 }, (_, i) => send(coach, 'client-1', i)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(60);
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(refused).toHaveLength(10);
    expect(refused.every((r) => (r.reason as TRPCError).code === 'TOO_MANY_REQUESTS')).toBe(true);
    expect(await stored('client-1')).toBe(60);
  });

  it('per sender across conversations (clients too), and recovery in the next window', async () => {
    const { client } = await thread();
    const limits = MESSAGE_SEND_LIMIT as { perSender: number; perConversation: number };
    const saved = { ...limits };
    limits.perSender = 5;
    limits.perConversation = 100;
    try {
      for (let i = 0; i < 5; i += 1) await send(client, 'client-1', i);
      expect(await refusal(send(client, 'client-1', 5))).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
      const later = Date.now() + MESSAGE_SEND_LIMIT.windowMs;
      vi.spyOn(Date, 'now').mockReturnValue(later);
      await expect(send(client, 'client-1', 6)).resolves.toBeTruthy();
    } finally {
      Object.assign(limits, saved);
    }
  });

  it('authorization stays first: a coach with no relationship is FORBIDDEN, never rate-limited into the client’s counters', async () => {
    await thread();
    const stranger = await insertUser({ _id: 'coach-x', role: 'coach' });
    const r = await refusal(callerWith({}, stranger).messages.send({ clientId: 'client-1', text: 'hi', clientMsgId: 'cm-x-1', coachId: 'coach-x' }));
    expect(r?.code).toBe('FORBIDDEN');
    expect(await (await getDb()).collection('rateLimits').countDocuments({ _id: { $regex: '^messages\\.' } as never })).toBe(0);
  });

  it('invites: 30 per creating coach per hour; 5 per destination address per coach per day; refusals create nothing and send nothing', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    for (let i = 0; i < INVITE_CREATE_LIMIT.perActor; i += 1) await callerWith({}, coach).invites.create({});
    const r = await refusal(callerWith({}, coach).invites.create({ email: 'one@t.test' }));
    expect(r).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(await (await getDb()).collection('signupInvites').countDocuments({ coachId: 'coach-1' })).toBe(INVITE_CREATE_LIMIT.perActor);
    expect(sent.invite).toEqual([]);

    // One address, one coach (B4.1: the counter is that coach's own — see the isolation suite below).
    const other = await insertUser({ _id: 'coach-2', role: 'coach' });
    for (let i = 0; i < INVITE_CREATE_LIMIT.perAddress; i += 1) await callerWith({}, other).invites.create({ email: 'victim@inbox.test' });
    expect(await refusal(callerWith({}, other).invites.create({ email: 'victim@inbox.test' }))).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(sent.invite.filter((s) => s.to === 'victim@inbox.test')).toHaveLength(INVITE_CREATE_LIMIT.perAddress);
    await expect(callerWith({}, other).invites.create({ email: 'someone-else@inbox.test' })).resolves.toBeTruthy();
  });
});

/**
 * B4 checkpoint 1 — review of the B36-R4 limits as approved by the owner (300 / sender and 60 /
 * conversation per 10 min; 30 invites / creator per hour and 5 / address per 24 h). The numbers are
 * unchanged; these pin what the review fixed or had no test for.
 */
describe('rate-limit review (B4 checkpoint 1)', () => {
  const db = async () => getDb();
  const messageCounters = async () => (await (await db()).collection('rateLimits').countDocuments({ _id: { $regex: '^messages\\.' } as never }));
  async function coachWithClients(n: number) {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    const now = Date.now();
    for (let i = 1; i <= n; i += 1) {
      await insertUser({ _id: `client-${i}`, role: 'client', assignedCoachId: 'coach-1' });
      await (await db()).collection('coachClients').insertOne({ _id: `coach-1__client-${i}` as never, coachId: 'coach-1', clientId: `client-${i}`, status: 'active', createdBy: 'coach-1', createdAt: now, updatedAt: now });
    }
    return coach;
  }
  const failure = async (p: Promise<unknown>) => p.then(() => null, (e: TRPCError & { cause?: { reason?: string } }) => ({ code: e.code, reason: e.cause?.reason }));

  it('a send refused for its conversation uses no quota: closed conversation (after a transfer) and no coach at all', async () => {
    await coachWithClients(1);
    const client = await insertUser({ _id: 'client-9', role: 'client', assignedCoachId: 'coach-1' });
    const now = Date.now();
    await (await db()).collection('coachClients').insertOne({ _id: 'coach-1__client-9' as never, coachId: 'coach-1', clientId: 'client-9', status: 'active', createdBy: 'coach-1', createdAt: now, updatedAt: now });
    // A message composed in a previous coach's conversation (the outbox's `coachId`).
    expect(await failure(callerWith({}, client).messages.send({ clientId: 'client-9', text: 'hi', clientMsgId: 'cm-1', coachId: 'coach-old' }))).toMatchObject({ code: 'CONFLICT', reason: 'CONVERSATION_CLOSED' });
    const orphan = await insertUser({ _id: 'client-0', role: 'client' });
    expect(await failure(callerWith({}, orphan).messages.send({ clientId: 'client-0', text: 'hi', clientMsgId: 'cm-2' }))).toMatchObject({ code: 'CONFLICT', reason: 'NO_ACTIVE_COACH' });
    expect(await messageCounters()).toBe(0);
  });

  it('per sender, concurrently across conversations: exactly the limit is stored, the rest refused with RATE_LIMITED', async () => {
    const coach = await coachWithClients(3);
    const limits = MESSAGE_SEND_LIMIT as { perSender: number; perConversation: number };
    const saved = { ...limits };
    limits.perSender = 20;
    limits.perConversation = 100;
    try {
      const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => callerWith({}, coach).messages.send({ clientId: `client-${(i % 3) + 1}`, text: `m${i}`, clientMsgId: `cm-${i}`, coachId: 'coach-1' })));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
      const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(refused.every((r) => (r.reason as TRPCError & { cause?: { reason?: string } }).cause?.reason === 'RATE_LIMITED')).toBe(true);
      expect(await (await db()).collection('messages').countDocuments({ fromUserId: 'coach-1' })).toBe(20);
    } finally {
      Object.assign(limits, saved);
    }
  });

  it('concurrent retries of one message store it once and all get the same message back', async () => {
    const coach = await coachWithClients(1);
    const out = await Promise.all(Array.from({ length: 10 }, () => callerWith({}, coach).messages.send({ clientId: 'client-1', text: 'once', clientMsgId: 'cm-same', coachId: 'coach-1' })));
    expect(new Set(out.map((m) => m.id)).size).toBe(1);
    expect(await (await db()).collection('messages').countDocuments({ clientId: 'client-1' })).toBe(1);
  });

  it('the first hits of a new window race safely (one counter, counted exactly) and the counter expires with its window', async () => {
    const fixed = Date.UTC(2026, 9, 22, 10, 7, 30);
    vi.spyOn(Date, 'now').mockReturnValue(fixed);
    const windowMs = 60 * 60_000;
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => enforceRateLimit('test.race', 'k', 30, windowMs)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(30);
    const docs = await (await db()).collection<{ _id: string; count: number; windowStart: number; expiresAt: Date }>('rateLimits').find({ _id: { $regex: '^test\\.race:' } }).toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].count).toBe(50);
    expect(docs[0].expiresAt.getTime()).toBe(docs[0].windowStart + windowMs);
    expect(docs[0].windowStart).toBeLessThanOrEqual(fixed);
  });

  it('one mailbox, one per-address counter however the address is written; the email still goes to the address as typed', async () => {
    expect(mailboxKey(' V.ictim+promo@GoogleMail.com ')).toBe('victim@gmail.com');
    expect(mailboxKey('first.last+x@company.test')).toBe('first.last@company.test'); // dots matter outside Gmail
    // B4.1: one coach cannot dodge its own per-address limit with aliases or case changes.
    const variants = ['Victim+a@Gmail.com', 'v.ictim@gmail.com', 'victim+b@googlemail.com', 'VICTIM@gmail.com', 'vic.tim+zz@gmail.com'];
    const coach = await insertUser({ _id: 'coach-v', role: 'coach' });
    for (const email of variants) await callerWith({}, coach).invites.create({ email });
    expect(await failure(callerWith({}, coach).invites.create({ email: 'victim@gmail.com' }))).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(sent.invite.map((s) => s.to)).toEqual(variants.map((v) => v.toLowerCase()));
  });

  it('counters never hold an email address, IP or account id in clear', async () => {
    const coach = await coachWithClients(1);
    await callerWith({}, coach).messages.send({ clientId: 'client-1', text: 'hi', clientMsgId: 'cm-1', coachId: 'coach-1' });
    await callerWith({}, coach).invites.create({ email: 'private.person@inbox.test' });
    await callerWith({}).auth.login({ email: 'private.person@inbox.test', password: 'not-the-password' }).catch(() => undefined);
    await callerWith({}).auth.requestPasswordReset({ email: 'private.person@inbox.test' });
    const ids = (await (await db()).collection('rateLimits').find({}).toArray()).map((d) => String(d._id));
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) expect(id).not.toMatch(/@|private|inbox|coach-1|client-1|10\.0\.0\.1/);
  });
});

/**
 * B4.1 (owner decision) — every coach's quotas are its own. Messages count per sender and per
 * sender × conversation; invites per creator and per creator × mailbox — always the AUTHENTICATED
 * account, never an id the browser sends — so one coach never consumes another's. The quotas of one
 * operation are charged as a unit and refunded when it is refused or not written. The invite email's
 * real outcome is recorded (never the server-side reason) and can be retried; the inbox itself keeps
 * an infrastructure ceiling that never blocks an invite.
 */
describe('B4.1 — independent per-coach quotas', () => {
  const db = async () => getDb();
  const limits = MESSAGE_SEND_LIMIT as { perSender: number; perConversation: number; windowMs: number };
  const inviteLimits = INVITE_CREATE_LIMIT as { perActor: number; actorWindowMs: number; perAddress: number; addressWindowMs: number };
  const ceiling = INVITE_EMAIL_CEILING as { perMailbox: number; windowMs: number };
  const saved = { limits: { ...limits }, inviteLimits: { ...inviteLimits }, ceiling: { ...ceiling } };
  afterEach(() => {
    Object.assign(limits, saved.limits);
    Object.assign(inviteLimits, saved.inviteLimits);
    Object.assign(ceiling, saved.ceiling);
  });

  async function twoCoaches() {
    const a = await insertUser({ _id: 'coach-a', role: 'coach' });
    const b = await insertUser({ _id: 'coach-b', role: 'coach' });
    const now = Date.now();
    for (const [coach, client] of [['coach-a', 'client-a1'], ['coach-a', 'client-a2'], ['coach-b', 'client-b1']]) {
      await insertUser({ _id: client, role: 'client', assignedCoachId: coach });
      await (await db()).collection('coachClients').insertOne({ _id: `${coach}__${client}` as never, coachId: coach, clientId: client, status: 'active', createdBy: coach, createdAt: now, updatedAt: now });
    }
    return { a, b };
  }
  const msg = (u: AuthedUser, clientId: string, i: number) => callerWith({}, u).messages.send({ clientId, text: `m${i}`, clientMsgId: `cm-${u.id}-${clientId}-${i}`, coachId: u.id });
  const invite = (u: AuthedUser, email?: string, extra: Record<string, unknown> = {}) => callerWith({}, u).invites.create({ ...(email ? { email } : {}), ...extra });
  const outcome = (p: Promise<unknown>) => p.then(() => 'ok', (e: TRPCError & { cause?: { reason?: string } }) => e.cause?.reason ?? e.code);
  const counts = async (bucket: string) =>
    (await (await db()).collection<{ _id: string; count: number }>('rateLimits').find({ _id: { $regex: `^${bucket.replace('.', '\\.')}:` } as never }).toArray()).map((d) => d.count).sort((x, y) => x - y);
  const invitesOf = async (coachId: string) => (await db()).collection('signupInvites').countDocuments({ coachId });

  it('messages: coach A exhausting its sender quota never touches coach B', async () => {
    const { a, b } = await twoCoaches();
    limits.perSender = 4;
    limits.perConversation = 100;
    for (let i = 0; i < 4; i += 1) await msg(a, i % 2 ? 'client-a1' : 'client-a2', i);
    expect(await outcome(msg(a, 'client-a1', 99))).toBe('RATE_LIMITED');
    for (let i = 0; i < 4; i += 1) expect(await outcome(msg(b, 'client-b1', i))).toBe('ok');
  });

  it('messages: a full conversation of coach A leaves A’s other conversations and coach B open', async () => {
    const { a, b } = await twoCoaches();
    limits.perSender = 100;
    limits.perConversation = 3;
    for (let i = 0; i < 3; i += 1) await msg(a, 'client-a1', i);
    expect(await outcome(msg(a, 'client-a1', 99))).toBe('RATE_LIMITED');
    expect(await outcome(msg(a, 'client-a2', 0))).toBe('ok');
    for (let i = 0; i < 3; i += 1) expect(await outcome(msg(b, 'client-b1', i))).toBe('ok');
  });

  it('a send refused by its conversation limit refunds the sender quota — refused sends consume nothing', async () => {
    const { a } = await twoCoaches();
    limits.perSender = 5;
    limits.perConversation = 3;
    for (let i = 0; i < 3; i += 1) await msg(a, 'client-a1', i);
    for (let i = 3; i < 7; i += 1) expect(await outcome(msg(a, 'client-a1', i))).toBe('RATE_LIMITED'); // 4 refused by the conversation
    for (let i = 0; i < 2; i += 1) expect(await outcome(msg(a, 'client-a2', i))).toBe('ok'); // 3 + 2 = the 5 the sender may send
    expect(await outcome(msg(a, 'client-a2', 2))).toBe('RATE_LIMITED'); // refused by the sender quota, not the conversation
    expect(await counts('messages.send')).toEqual([5]);
    expect(await counts('messages.thread')).toEqual([2, 3]);
  });

  it('invites: two coaches invite the same address independently — 5 each; a 6th is refused for that coach only', async () => {
    const { a, b } = await twoCoaches();
    for (let i = 0; i < 5; i += 1) expect(await outcome(invite(a, 'same.person@inbox.test'))).toBe('ok');
    expect(await outcome(invite(a, 'same.person@inbox.test'))).toBe('RATE_LIMITED');
    for (let i = 0; i < 5; i += 1) expect(await outcome(invite(b, 'Same.Person@Inbox.test'))).toBe('ok');
    expect(await outcome(invite(b, 'same.person@inbox.test'))).toBe('RATE_LIMITED');
    expect([await invitesOf('coach-a'), await invitesOf('coach-b')]).toEqual([5, 5]);
    expect(sent.invite.filter((s) => s.to.toLowerCase() === 'same.person@inbox.test')).toHaveLength(10);
  });

  it('concurrent invites to one address by one coach: exactly 5 created, and only they are charged', async () => {
    const { a } = await twoCoaches();
    const r = await Promise.all(Array.from({ length: 12 }, () => outcome(invite(a, 'rush@inbox.test'))));
    expect(r.filter((x) => x === 'ok')).toHaveLength(5);
    expect(r.filter((x) => x === 'RATE_LIMITED')).toHaveLength(7);
    expect(await invitesOf('coach-a')).toBe(5);
    expect(await counts('invites.create')).toEqual([5]);
    expect(await counts('invites.email')).toEqual([5]);
  });

  it('a refusal by the per-address limit refunds the creator quota', async () => {
    const { a } = await twoCoaches();
    inviteLimits.perActor = 4;
    inviteLimits.perAddress = 2;
    await invite(a, 'x@inbox.test');
    await invite(a, 'x@inbox.test');
    for (let i = 0; i < 3; i += 1) expect(await outcome(invite(a, 'x@inbox.test'))).toBe('RATE_LIMITED');
    expect(await outcome(invite(a, 'y@inbox.test'))).toBe('ok');
    expect(await outcome(invite(a))).toBe('ok');
    expect(await outcome(invite(a))).toBe('RATE_LIMITED'); // the 4 created, not the 3 refused, used the creator quota
    expect(await invitesOf('coach-a')).toBe(4);
  });

  it('only a coach consumes its own quota: a client is refused before any counter; a coachId sent by another coach is ignored; staff creating for a coach use their own', async () => {
    const { a, b } = await twoCoaches();
    inviteLimits.perAddress = 1;
    const client = await insertUser({ _id: 'client-z', role: 'client' });
    expect(await outcome(callerWith({}, client).invites.create({ email: 'v@inbox.test', coachId: 'coach-a' }))).toBe('FORBIDDEN');
    expect(await counts('invites.create')).toEqual([]);
    const bOwn = await invite(b, 'v@inbox.test', { coachId: 'coach-a' });
    expect(bOwn.coachId).toBe('coach-b');
    expect(await outcome(invite(a, 'v@inbox.test'))).toBe('ok'); // coach A's per-address quota untouched by B
    const staff = await insertUser({ _id: 'staff-1', role: 'admin' });
    const forA = await callerWith({}, staff).invites.create({ email: 'w@inbox.test', coachId: 'coach-a' });
    expect(forA.coachId).toBe('coach-a');
    expect(await outcome(invite(a, 'w@inbox.test'))).toBe('ok'); // staff used their own quota
  });

  it('the invite email outcome is told truthfully — sent / not sent — and the server-side reason never leaves the server', async () => {
    const { a } = await twoCoaches();
    expect(await invite(a, 'ok@inbox.test')).toMatchObject({ emailStatus: 'sent', emailAttempts: 1 });
    vi.mocked(sendClientInviteEmail).mockRejectedValueOnce(new Error('provider down'));
    const failed = await invite(a, 'fail@inbox.test');
    expect(failed).toMatchObject({ status: 'pending', emailStatus: 'not-sent' });
    expect(failed).not.toHaveProperty('emailIssue');
    vi.mocked(sendClientInviteEmail).mockResolvedValueOnce(false); // email disabled on this deployment
    expect(await invite(a, 'off@inbox.test')).toMatchObject({ emailStatus: 'not-sent' });
    expect(await invite(a)).not.toHaveProperty('emailStatus'); // no address, nothing to report
    const listed = await callerWith({}, a).invites.list({});
    expect(listed.map((i) => i.emailStatus ?? 'none').sort()).toEqual(['none', 'not-sent', 'not-sent', 'sent']);
    expect(listed.some((i) => 'emailIssue' in i)).toBe(false);
    expect(await (await db()).collection('signupInvites').findOne({ _id: failed._id as never })).toMatchObject({ emailStatus: 'not-sent', emailIssue: 'provider-error' });
  });

  it('a not-sent invite email can be sent again — by its coach only; an attempt that sends nothing is refunded', async () => {
    const { a, b } = await twoCoaches();
    inviteLimits.perAddress = 2;
    vi.mocked(sendClientInviteEmail).mockRejectedValueOnce(new Error('provider down'));
    const inv = await invite(a, 'retry@inbox.test'); // 1 of 2
    expect(inv.emailStatus).toBe('not-sent');
    expect(await outcome(callerWith({}, b).invites.resendEmail({ code: inv._id }))).toBe('NOT_FOUND');
    vi.mocked(sendClientInviteEmail).mockResolvedValueOnce(false);
    expect(await callerWith({}, a).invites.resendEmail({ code: inv._id })).toEqual({ code: inv._id, emailStatus: 'not-sent' }); // refunded
    expect(await callerWith({}, a).invites.resendEmail({ code: inv._id })).toEqual({ code: inv._id, emailStatus: 'sent' }); // 2 of 2
    expect(await outcome(callerWith({}, a).invites.resendEmail({ code: inv._id }))).toBe('RATE_LIMITED');
    expect(await (await db()).collection('signupInvites').findOne({ _id: inv._id as never })).toMatchObject({ emailStatus: 'sent', emailAttempts: 3 });
    await callerWith({}, a).invites.revoke({ code: inv._id });
    expect(await outcome(callerWith({}, a).invites.resendEmail({ code: inv._id }))).toBe('CONFLICT');
  });

  it('inbox protection: past the cross-Forma email ceiling the invite is still created and the coach is told only that the email was not sent', async () => {
    const { a, b } = await twoCoaches();
    ceiling.perMailbox = 2;
    await invite(a, 'popular@inbox.test');
    await invite(b, 'popular@inbox.test');
    const third = await invite(a, 'popular@inbox.test');
    expect(third).toMatchObject({ status: 'pending', emailStatus: 'not-sent' });
    expect(third).not.toHaveProperty('emailIssue');
    expect(sent.invite.filter((s) => s.to === 'popular@inbox.test')).toHaveLength(2);
    for (let i = 0; i < 4; i += 1) expect(await outcome(invite(b, 'popular@inbox.test'))).toBe('ok'); // B's own 5 are intact
    expect(await outcome(invite(b, 'popular@inbox.test'))).toBe('RATE_LIMITED');
  });
});
