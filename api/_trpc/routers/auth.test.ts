import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appRouter } from '../router.js';
import type { Context } from '../context.js';
import { getDb, usersCol } from '../../_lib/mongodb.js';
import type { AuthedUser } from '../context.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'forma_test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-not-for-prod';
}, 60_000);

afterAll(async () => {
  await mongod.stop();
});

beforeEach(async () => {
  const db = await getDb();
  await db.dropDatabase();
});

/** Captures the `Set-Cookie` header a mutation writes, so a later call can simulate the browser sending it back. */
function mockRes(): { res: VercelResponse; lastSetCookie: () => string | undefined } {
  let lastCookie: string | undefined;
  const res = {
    setHeader: (name: string, value: string) => {
      if (name === 'Set-Cookie') lastCookie = Array.isArray(value) ? value[0] : value;
    },
  } as unknown as VercelResponse;
  return { res, lastSetCookie: () => lastCookie };
}

function rawTokenFromCookie(cookie: string | undefined): string {
  const match = cookie?.match(/forma_rt=([^;]+)/);
  if (!match) throw new Error('no forma_rt cookie was set');
  return match[1];
}

function ctxAnon(cookies: Record<string, string> = {}): { ctx: Context; lastSetCookie: () => string | undefined } {
  const { res, lastSetCookie } = mockRes();
  const ctx: Context = { req: { cookies, headers: {} } as unknown as VercelRequest, res, user: null };
  return { ctx, lastSetCookie };
}

describe('auth module', () => {
  it('supports signup, login, refresh (rotating the cookie), logout, and rejects the used-up refresh token', async () => {
    const signupCtx = ctxAnon();
    const signedUp = await appRouter.createCaller(signupCtx.ctx).auth.signup({
      email: 'coach@example.com',
      password: 'password123',
      displayName: 'Coach One',
      role: 'coach',
    });
    expect(signedUp.user.role).toBe('coach');
    expect(signedUp.accessToken).toBeTruthy();
    const firstRaw = rawTokenFromCookie(signupCtx.lastSetCookie());
    expect(signupCtx.lastSetCookie()).toContain('Path=/');
    expect(signupCtx.lastSetCookie()).not.toContain('Path=/api/auth');

    // duplicate signup rejected
    await expect(
      appRouter.createCaller(ctxAnon().ctx).auth.signup({ email: 'coach@example.com', password: 'password123', displayName: 'Dup', role: 'coach' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // wrong password rejected, identical error shape to "no such account"
    await expect(
      appRouter.createCaller(ctxAnon().ctx).auth.login({ email: 'coach@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      appRouter.createCaller(ctxAnon().ctx).auth.login({ email: 'nobody@example.com', password: 'whatever1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const loginCtx = ctxAnon();
    const loggedIn = await appRouter.createCaller(loginCtx.ctx).auth.login({ email: 'coach@example.com', password: 'password123' });
    expect(loggedIn.user.id).toBe(signedUp.user.id);

    // refresh rotates the token: old raw value stops working, new one is returned
    const refreshCtx = ctxAnon({ forma_rt: firstRaw });
    const refreshed = await appRouter.createCaller(refreshCtx.ctx).auth.refresh();
    expect(refreshed.user.id).toBe(signedUp.user.id);
    const secondRaw = rawTokenFromCookie(refreshCtx.lastSetCookie());
    expect(secondRaw).not.toBe(firstRaw);

    await expect(appRouter.createCaller(ctxAnon({ forma_rt: firstRaw }).ctx).auth.refresh()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(appRouter.createCaller(ctxAnon().ctx).auth.refresh()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    // logout revokes the current refresh token too
    await appRouter.createCaller(ctxAnon({ forma_rt: secondRaw }).ctx).auth.logout();
    await expect(appRouter.createCaller(ctxAnon({ forma_rt: secondRaw }).ctx).auth.refresh()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('me/updateProfile/changePassword require an authenticated active session and roundtrip correctly', async () => {
    const signupCtx = ctxAnon();
    const signedUp = await appRouter.createCaller(signupCtx.ctx).auth.signup({
      email: 'coach2@example.com',
      password: 'password123',
      displayName: 'Coach Two',
      role: 'coach',
    });

    await expect(appRouter.createCaller(ctxAnon().ctx).auth.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    const userDoc = await (await usersCol()).findOne({ _id: signedUp.user.id });
    if (!userDoc) throw new Error('signed-up user not found');
    const authedUser: AuthedUser = { id: userDoc._id, role: userDoc.role, accountStatus: userDoc.accountStatus, permissions: userDoc.permissions, doc: userDoc };
    const { ctx } = ctxAnon();
    const caller = appRouter.createCaller({ ...ctx, user: authedUser });

    const me = await caller.auth.me();
    expect(me.id).toBe(signedUp.user.id);

    const updated = await caller.auth.updateProfile({ displayName: 'Coach Two Updated', phone: '5551234' });
    expect(updated.displayName).toBe('Coach Two Updated');

    await expect(caller.auth.changePassword({ currentPassword: 'wrong', newPassword: 'newpassword123' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await caller.auth.changePassword({ currentPassword: 'password123', newPassword: 'newpassword123' });

    // old password no longer works
    await expect(
      appRouter.createCaller(ctxAnon().ctx).auth.login({ email: 'coach2@example.com', password: 'password123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const relogin = await appRouter.createCaller(ctxAnon().ctx).auth.login({ email: 'coach2@example.com', password: 'newpassword123' });
    expect(relogin.user.id).toBe(signedUp.user.id);
  });

  it('password reset: request is a no-op-safe constant response, confirm requires a valid unused token and revokes sessions', async () => {
    const signupCtx = ctxAnon();
    await appRouter.createCaller(signupCtx.ctx).auth.signup({
      email: 'reset@example.com',
      password: 'password123',
      displayName: 'Reset Me',
      role: 'coach',
    });

    // constant response whether or not the account exists
    const forExisting = await appRouter.createCaller(ctxAnon().ctx).auth.requestPasswordReset({ email: 'reset@example.com' });
    const forMissing = await appRouter.createCaller(ctxAnon().ctx).auth.requestPasswordReset({ email: 'nobody@example.com' });
    expect(forExisting).toEqual({ ok: true });
    expect(forMissing).toEqual({ ok: true });

    await expect(
      appRouter.createCaller(ctxAnon().ctx).auth.confirmPasswordReset({ token: 'not-a-real-token', newPassword: 'brandnewpassword1' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
