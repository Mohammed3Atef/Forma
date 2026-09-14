import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { usersCol, passwordResetsCol } from '../../_lib/mongodb.js';
import { hashPassword, verifyPassword } from '../../_lib/password.js';
import {
  issueSession,
  rotateSession,
  findValidRefreshToken,
  readRefreshCookie,
  revokeRefreshToken,
  revokeAllUserSessions,
  generateRawToken,
  hashRawToken,
  clearRefreshCookie,
} from '../../_lib/tokens.js';
import { toPublicUser, type UserDoc } from '../../_lib/types.js';
import { enforceRateLimit, getClientIp } from '../../_lib/rateLimit.js';

// 5 signups / hour per IP — cheap deterrent against scripted bulk account creation.
const SIGNUP_MAX_ATTEMPTS = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
// 10 attempts / 15 min per (ip, email) pair — blunts both a single attacker
// hammering one account and low-and-slow guessing spread across many emails.
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
// 5 attempts / hour per account — this route re-checks the current password,
// so it's effectively a login guess surface too.
const CHANGE_PW_MAX_ATTEMPTS = 5;
const CHANGE_PW_WINDOW_MS = 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
// 5 requests / hour per target email — the response is constant either way, so
// this isn't about enumeration, just capping spam/log noise against one address.
const RESET_MAX_ATTEMPTS = 5;
const RESET_WINDOW_MS = 60 * 60 * 1000;

export const authRouter = router({
  /**
   * Coach self-registration only, per the product decision made for Phase 1:
   * active immediately, no manual admin approval. Client accounts are created
   * via the coach invite flow. Admin/super_admin accounts are never
   * self-service; use scripts/seed-mongo-admin.mjs.
   */
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).max(200),
        displayName: z.string().trim().min(1).max(120),
        phone: z.string().trim().max(40).optional(),
        role: z.literal('coach'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit('auth.signup', getClientIp(ctx.req), SIGNUP_MAX_ATTEMPTS, SIGNUP_WINDOW_MS);
      const users = await usersCol();
      if (await users.findOne({ emailLower: input.email })) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists.' });
      }
      const now = Date.now();
      const doc: UserDoc = {
        _id: crypto.randomUUID(),
        email: input.email,
        emailLower: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        displayNameLower: input.displayName.toLowerCase(),
        phone: input.phone,
        role: 'coach',
        accountStatus: 'active',
        permissions: [],
        featureFlags: {},
        createdBy: 'self',
        createdAt: now,
        updatedAt: now,
      };
      await users.insertOne(doc);
      const session = await issueSession(ctx.res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
      return { user: toPublicUser(doc), accessToken: session.accessToken };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit('auth.login', `${getClientIp(ctx.req)}:${input.email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
      const users = await usersCol();
      const doc = await users.findOne({ emailLower: input.email });
      // Deliberately identical error for "no such account" and "wrong password"
      // so a bad actor can't use this endpoint to enumerate registered emails.
      if (!doc || !(await verifyPassword(input.password, doc.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password.' });
      }
      // Login itself does not gate on accountStatus (pending/suspended accounts
      // can still authenticate) — the frontend derives its own routing/UI phase
      // from accountStatus after sign-in, same as today's Firebase Auth flow.
      const session = await issueSession(ctx.res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
      return { user: toPublicUser(doc), accessToken: session.accessToken };
    }),

  /**
   * Exchanges the httpOnly refresh cookie for a fresh access token (and
   * rotates the refresh token). Also returns the current user doc so the
   * frontend can pick up a role/status change without a separate `auth.me`
   * round-trip.
   */
  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const raw = readRefreshCookie(ctx.req.cookies);
    if (!raw) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No session' });
    const tokenDoc = await findValidRefreshToken(raw);
    if (!tokenDoc) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Session expired' });
    const users = await usersCol();
    const user = await users.findOne({ _id: tokenDoc.userId });
    if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Account not found' });
    const session = await rotateSession(ctx.res, raw, { id: user._id, role: user.role, accountStatus: user.accountStatus });
    return { user: toPublicUser(user), accessToken: session.accessToken };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const raw = readRefreshCookie(ctx.req.cookies);
    if (raw) await revokeRefreshToken(raw);
    clearRefreshCookie(ctx.res);
  }),

  me: protectedProcedure.query(({ ctx }) => toPublicUser(ctx.user.doc)),

  /** Mirrors `sessionStore.updateSelf` — the signed-in user's own non-control fields only. */
  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().trim().min(1).max(120).optional(),
        phone: z.string().trim().max(40).optional(),
        photoUrl: z.string().trim().max(2000).optional(),
        timezone: z.string().trim().max(80).optional(),
        currency: z.string().trim().max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const set: Partial<UserDoc> = { updatedAt: Date.now() };
      for (const [k, v] of Object.entries(input)) {
        if (v !== undefined) (set as Record<string, unknown>)[k] = v;
      }
      if (input.displayName) set.displayNameLower = input.displayName.toLowerCase();
      const users = await usersCol();
      await users.updateOne({ _id: ctx.user.id }, { $set: set });
      const updated = await users.findOne({ _id: ctx.user.id });
      return toPublicUser(updated!);
    }),

  changePassword: protectedProcedure
    .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit('auth.changePassword', ctx.user.id, CHANGE_PW_MAX_ATTEMPTS, CHANGE_PW_WINDOW_MS);
      if (!(await verifyPassword(input.currentPassword, ctx.user.doc.passwordHash))) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect.' });
      }
      const users = await usersCol();
      await users.updateOne(
        { _id: ctx.user.id },
        { $set: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, updatedAt: Date.now() } },
      );
      // Force every other signed-in device to re-authenticate.
      await revokeAllUserSessions(ctx.user.id);
    }),

  /**
   * TODO before this is production-usable: wire in a real email provider (e.g.
   * Resend) to actually deliver the reset link — this route currently only
   * creates the token and logs it server-side outside production.
   */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ input }) => {
      await enforceRateLimit('auth.resetRequest', input.email, RESET_MAX_ATTEMPTS, RESET_WINDOW_MS);
      const users = await usersCol();
      const user = await users.findOne({ emailLower: input.email });
      // Always respond ok regardless of whether the account exists, so this
      // endpoint can't be used to enumerate registered emails.
      if (user) {
        const raw = generateRawToken();
        const resets = await passwordResetsCol();
        await resets.insertOne({
          _id: hashRawToken(raw),
          userId: user._id,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
          used: false,
        });
        if (process.env.NODE_ENV !== 'production') {
          console.info(`[auth] password reset token for ${user.email}: ${raw}`);
        } else {
          console.warn('[auth] password reset requested but no email provider is configured — token was not delivered.');
        }
      }
      return { ok: true };
    }),

  confirmPasswordReset: publicProcedure
    .input(z.object({ token: z.string().min(1), newPassword: z.string().min(8).max(200) }))
    .mutation(async ({ input }) => {
      const resets = await passwordResetsCol();
      const tokenHash = hashRawToken(input.token);
      const reset = await resets.findOne({ _id: tokenHash });
      if (!reset || reset.used || reset.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link is invalid or has expired.' });
      }
      const users = await usersCol();
      await users.updateOne(
        { _id: reset.userId },
        { $set: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, updatedAt: Date.now() } },
      );
      await resets.updateOne({ _id: tokenHash }, { $set: { used: true } });
      await revokeAllUserSessions(reset.userId);
      return { ok: true };
    }),
});
