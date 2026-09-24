import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, authedProcedure } from '../trpc.js';
import { usersCol, passwordResetsCol, withDbTransaction } from '../../_lib/mongodb.js';
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
import { sendPasswordResetEmail, sendWelcomeEmail } from '../../_lib/email.js';
import { verifyGoogleIdToken } from '../../_lib/google.js';
import { ensureTrialPlan } from '../../coach-plans/_data.js';

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
   *
   * There is exactly one plan cycle: every coach starts on Trial (2 clients,
   * 15 days) — no plan picker at signup. Once the trial ends, a system cron
   * (`api/cron/enforce-trial-expiry.ts`) raises a Pro plan request for a
   * Super Admin to confirm payment on; see that file for the grace-period /
   * account-pending mechanics.
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
      const coachId = crypto.randomUUID();
      const doc: UserDoc = {
        _id: coachId,
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

      // The coach's account + their ALWAYS-active Trial plan are one atomic
      // unit — every write below threads the SAME transaction session or it
      // would commit outside the transaction and silently break atomicity.
      await withDbTransaction(async (session) => {
        await users.insertOne(doc, { session });
        await ensureTrialPlan(coachId, session);
      });

      const session = await issueSession(ctx.res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
      // Best-effort — a delivery failure must never fail signup itself.
      const appUrl = ctx.req.headers?.origin || process.env.APP_BASE_URL || 'https://www.useforma.fit';
      sendWelcomeEmail(doc.email, doc.displayName, appUrl).catch((e) => console.error('[auth] failed to send welcome email:', e));
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

  /**
   * Deliberately `authedProcedure` (bare — no active-status requirement), NOT
   * `protectedProcedure`: this is exactly what `sessionStore.refreshAccount()`
   * calls on every app load to compute `phase` (via `phaseForStatus`) — the
   * mechanism that routes a pending/suspended account to its dedicated
   * `<AccountPending/>`/`<AccountSuspended/>` screen. Gating this endpoint on
   * `active` would make it throw for exactly the accounts it exists to
   * report on, bouncing them to the anonymous/login screen instead of their
   * real status screen. Matches the old REST `me.ts`, which only ever called
   * bare `requireUser()`.
   */
  me: authedProcedure.query(({ ctx }) => toPublicUser(ctx.user.doc)),

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

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email() }))
    .mutation(async ({ ctx, input }) => {
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
        const origin = ctx.req.headers?.origin || process.env.APP_BASE_URL || 'https://www.useforma.fit';
        const resetUrl = `${origin}/reset/${raw}`;
        if (process.env.NODE_ENV !== 'production' && !process.env.RESEND_API_KEY) {
          console.info(`[auth] password reset link for ${user.email}: ${resetUrl}`);
        } else {
          // Never let a delivery failure change this endpoint's response —
          // that would reopen the account-enumeration hole the constant
          // `{ ok: true }` reply exists to close.
          try {
            await sendPasswordResetEmail(user.email, resetUrl);
          } catch (e) {
            console.error('[auth] failed to send password reset email:', e);
          }
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

  /**
   * Sign-in-with-Google, verified against Google's own servers via
   * `verifyGoogleIdToken` — never trust the ID token's claims unchecked.
   * Login only: a Google account with no matching Forma account is rejected
   * rather than auto-creating one, mirroring the product's existing rule that
   * self-service signup is a deliberate, explicit action (and coach-only).
   */
  googleSignIn: publicProcedure
    .input(z.object({ idToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit('auth.googleSignIn', getClientIp(ctx.req), LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
      let profile;
      try {
        profile = await verifyGoogleIdToken(input.idToken);
      } catch (e) {
        console.error('[auth] Google ID token verification failed:', e);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Could not verify this Google sign-in.' });
      }
      const users = await usersCol();
      const doc = await users.findOne({ emailLower: profile.email.toLowerCase() });
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No Forma account found for this Google account. Sign up first.' });
      }
      const session = await issueSession(ctx.res, { id: doc._id, role: doc.role, accountStatus: doc.accountStatus });
      return { user: toPublicUser(doc), accessToken: session.accessToken };
    }),
});
