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
import { INVITE_CREATE_LIMIT } from './invites.js';

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

  it('invites: 30 per creating coach per hour; 5 per destination address per day across coaches; refusals create nothing and send nothing', async () => {
    const coach = await insertUser({ _id: 'coach-1', role: 'coach' });
    for (let i = 0; i < INVITE_CREATE_LIMIT.perActor; i += 1) await callerWith({}, coach).invites.create({});
    const r = await refusal(callerWith({}, coach).invites.create({ email: 'one@t.test' }));
    expect(r).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(await (await getDb()).collection('signupInvites').countDocuments({ coachId: 'coach-1' })).toBe(INVITE_CREATE_LIMIT.perActor);
    expect(sent.invite).toEqual([]);

    // One address, many (throwaway) coaches: bounded across all of them.
    for (let i = 0; i < INVITE_CREATE_LIMIT.perAddress; i += 1) {
      const c = await insertUser({ _id: `spammer-${i}`, role: 'coach' });
      await callerWith({}, c).invites.create({ email: 'victim@inbox.test' });
    }
    const extra = await insertUser({ _id: 'spammer-x', role: 'coach' });
    expect(await refusal(callerWith({}, extra).invites.create({ email: 'victim@inbox.test' }))).toMatchObject({ code: 'TOO_MANY_REQUESTS', reason: 'RATE_LIMITED' });
    expect(sent.invite.filter((s) => s.to === 'victim@inbox.test')).toHaveLength(INVITE_CREATE_LIMIT.perAddress);
    await expect(callerWith({}, extra).invites.create({ email: 'someone-else@inbox.test' })).resolves.toBeTruthy();
  });
});
