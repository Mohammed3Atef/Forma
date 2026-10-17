import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { issueSession } from '../../_lib/tokens.js';
import { toPublicUser, type UserDoc } from '../../_lib/types.js';
import { capError, coachCapStatus, coachClientsCol, relId, releaseClientSlot, reserveClientSlot } from '../../coach-clients/_data.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import { DEFAULT_TTL_MS, buildClaimSubscription, generateInviteCode, invitesCol, isClaimable, normalizeCode } from '../../coach-clients/_handlers/invites-data.js';
import type { SignupInviteDoc } from '../../coach-clients/_handlers/invites-types.js';
import { sendClientInviteEmail, sendWelcomeEmail } from '../../_lib/email.js';
import { enforceRateLimit, getClientIp } from '../../_lib/rateLimit.js';

/** B3.0.1 / B3-S03: per-IP limits on the two public invite procedures (codes are ~40-bit random; this stops scraping). */
const LOOKUP_MAX = 30;
const CLAIM_MAX = 10;
const INVITE_WINDOW_MS = 10 * 60 * 1000;

/** `m•••@gmail.com` — enough for the invitee to recognise their address, useless to anyone else. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  return `${local.charAt(0)}•••@${domain}`;
}

const SubscriptionStatusEnum = z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']);
const BillingCycleEnum = z.enum(['weekly', 'monthly', 'quarterly', 'custom']);

/**
 * Last-resort display name when nobody ever provided a real one (not the
 * coach at invite-creation, not the client on the claim form) — turns
 * `john.doe23` into `John Doe` instead of showing the raw handle verbatim
 * (which is what a bare `email.split('@')[0]` used to do, e.g. a client
 * named "muhammedatef57" in their welcome email). Still just a best-effort
 * guess, not a real name — genuinely last resort.
 */
function humanizeEmailLocalPart(email: string): string {
  const local = email.split('@')[0] || '';
  const words = local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length ? words.join(' ') : local;
}

/** tRPC port of `api/coach-clients/_handlers/invites-{index,code,claim}.ts` (was `/api/invites/*`). */
export const invitesRouter = router({
  /** The requesting coach's own invites, newest first (an admin with `coaches.assign` may pass `coachId` for oversight). */
  list: authedProcedure
    .input(z.object({ status: z.enum(['pending', 'claimed', 'revoked', 'all']).optional(), coachId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const col = await invitesCol();
      const canAssign = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');
      if (ctx.user.role !== 'coach' && !canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.coachId && input.coachId !== ctx.user.id && !canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      const coachId = input.coachId && canAssign ? input.coachId : ctx.user.id;
      const status = input.status ?? 'pending';
      const filter: Record<string, unknown> = { coachId };
      if (status !== 'all') filter.status = status;
      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      const now = Date.now();
      return status === 'pending' ? docs.filter((i) => i.expiresAt == null || i.expiresAt > now) : docs;
    }),

  /** Coach generates a new pending invite (with the client's billing/subscription settings applied on claim). */
  create: protectedProcedure
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email().optional(),
        displayName: z.string().trim().min(1).max(120).optional(),
        phone: z.string().trim().max(40).optional(),
        subStatus: SubscriptionStatusEnum.optional(),
        subPlanName: z.string().trim().max(120).optional(),
        subPrice: z.number().nonnegative().optional(),
        subCurrency: z.string().trim().max(10).optional(),
        subBillingCycle: BillingCycleEnum.optional(),
        subMonths: z.number().int().positive().optional(),
        subDays: z.number().int().positive().optional(),
        subTrialDays: z.number().int().positive().optional(),
        ttlMs: z.number().int().positive().nullable().optional(),
        coachId: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let coachId: string;
      if (ctx.user.role === 'coach') {
        coachId = ctx.user.id;
      } else if (hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign')) {
        if (!input.coachId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'coachId is required' });
        coachId = input.coachId;
      } else {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const users = await usersCol();
      const coach = await users.findOne({ _id: coachId });
      if (!coach) throw new TRPCError({ code: 'NOT_FOUND', message: 'Coach not found' });

      const col = await invitesCol();
      const now = Date.now();
      const ttl = input.ttlMs === undefined ? DEFAULT_TTL_MS : input.ttlMs;

      let created: SignupInviteDoc | null = null;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const code = generateInviteCode();
        const invite: SignupInviteDoc = {
          _id: code,
          coachId,
          status: 'pending',
          claimedByUid: null,
          createdAt: now,
          claimedAt: null,
          expiresAt: ttl === null ? null : now + ttl,
          ...(coach.displayName ? { coachName: coach.displayName } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.displayName ? { displayName: input.displayName } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          subStatus: input.subStatus ?? 'trial',
          ...(input.subPlanName ? { subPlanName: input.subPlanName } : {}),
          ...(input.subPrice != null ? { subPrice: input.subPrice } : {}),
          ...(input.subCurrency ? { subCurrency: input.subCurrency } : {}),
          ...(input.subBillingCycle ? { subBillingCycle: input.subBillingCycle } : {}),
          ...(input.subMonths != null ? { subMonths: input.subMonths } : {}),
          ...(input.subDays != null ? { subDays: input.subDays } : {}),
          ...(input.subTrialDays != null ? { subTrialDays: input.subTrialDays } : {}),
        };
        try {
          await col.insertOne(invite);
          created = invite;
        } catch (e) {
          if (!(e instanceof Error) || !('code' in e) || (e as { code?: number }).code !== 11000) throw e;
        }
      }
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not allocate a unique invite code' });
      // Best-effort — the code/link is also shown in-app for manual copy/share
      // regardless, so a delivery failure here must never fail invite creation.
      if (created.email) {
        const appUrl = ctx.req.headers?.origin || process.env.APP_BASE_URL || 'https://www.useforma.fit';
        sendClientInviteEmail(created.email, {
          coachName: coach.displayName || 'Your coach',
          inviteUrl: `${appUrl}/invite/${created._id}`,
          inviteCode: created._id,
          appUrl,
        }).catch((e) => console.error('[invites] failed to send invite email:', e));
      }
      return created;
    }),

  /**
   * PUBLIC (pre-auth) lookup for the claim screen. The code is the capability — no list/enumerate procedure exists.
   * B3.0.1 / B3-S03: returns ONLY what the claim screen needs — never the invitee's email or phone, the
   * coach id, the price / subscription template, the creator or claim fields. Rate-limited per IP.
   */
  getByCode: publicProcedure.input(z.object({ code: z.string().min(1) })).query(async ({ ctx, input }) => {
    await enforceRateLimit('invites.getByCode', getClientIp(ctx.req), LOOKUP_MAX, INVITE_WINDOW_MS);
    const code = normalizeCode(input.code);
    const col = await invitesCol();
    const invite = await col.findOne({ _id: code });
    if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    const email = invite.email?.trim();
    return {
      _id: invite._id,
      status: invite.status,
      claimable: isClaimable(invite),
      expiresAt: invite.expiresAt ?? null,
      ...(invite.coachName ? { coachName: invite.coachName } : {}),
      ...(invite.displayName ? { displayName: invite.displayName } : {}),
      hasEmail: !!email,
      ...(email ? { emailHint: maskEmail(email) } : {}),
    };
  }),

  /** The owning coach (or an admin with `coaches.assign`) revokes a pending invite. Soft-revoke only — never deletes the doc. */
  revoke: protectedProcedure.input(z.object({ code: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    const code = normalizeCode(input.code);
    const col = await invitesCol();
    const invite = await col.findOne({ _id: code });
    if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    const canManage =
      (ctx.user.role === 'coach' && invite.coachId === ctx.user.id) ||
      hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');
    if (!canManage) throw new TRPCError({ code: 'FORBIDDEN' });
    if (invite.status === 'claimed') throw new TRPCError({ code: 'CONFLICT', message: 'Cannot revoke an invite that has already been claimed' });
    // B3.3: compare-and-set — a claim landing between the read and this write must never be overwritten to "revoked"
    // (the client's account and relationship already exist by then).
    const res = await col.updateOne({ _id: code, status: { $ne: 'claimed' } }, { $set: { status: 'revoked' } });
    if (res.matchedCount === 0) throw new TRPCError({ code: 'CONFLICT', message: 'Cannot revoke an invite that has already been claimed' });
    return { ...invite, status: 'revoked' as const };
  }),

  /**
   * PUBLIC (pre-auth). All-or-nothing join: validates the code, enforces the destination
   * coach's client cap, creates the client's user + relationship docs, atomically flips the
   * invite to 'claimed' (rejecting a concurrent double-claim), and signs the new client in.
   * A failure after the atomic claim rolls the invite back to 'pending' and removes the user
   * doc if it was already inserted, so the code stays usable and no orphaned account is left.
   */
  claim: publicProcedure
    .input(
      z.object({
        code: z.string().trim().min(1),
        email: z.string().trim().toLowerCase().email().optional(),
        phone: z.string().trim().min(1),
        password: z.string().min(8).max(200),
        displayName: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit('invites.claim', getClientIp(ctx.req), CLAIM_MAX, INVITE_WINDOW_MS);
      const code = normalizeCode(input.code);
      const invites = await invitesCol();
      const invite = await invites.findOne({ _id: code });
      if (!isClaimable(invite)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This invite is no longer valid' });
      const inv = invite!;

      const email = (inv.email?.trim() || input.email?.trim() || '').toLowerCase();
      if (!email) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Email is required' });

      const users = await usersCol();
      if (await users.findOne({ emailLower: email })) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists.' });
      }
      // Advisory early check so a full coach fails fast with the right message
      // BEFORE the invite is flipped; the binding gate is the atomic slot
      // reservation below.
      const precheck = await coachCapStatus(inv.coachId);
      if (precheck !== 'ok') throw capError(precheck);

      const now = Date.now();
      const clientId = crypto.randomUUID();

      const claimResult = await invites.findOneAndUpdate(
        { _id: code, status: 'pending', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $set: { status: 'claimed', claimedByUid: clientId, claimedAt: now } },
      );
      if (!claimResult) throw new TRPCError({ code: 'CONFLICT', message: 'This invite was just claimed by someone else' });

      const unclaim = () =>
        invites
          .updateOne({ _id: code }, { $set: { status: 'pending' }, $unset: { claimedByUid: '', claimedAt: '' } })
          .catch((e) => console.warn('[invites.claim] unclaim rollback failed (non-fatal):', e));

      // Atomic cap gate: of N simultaneous claims for a coach's last slot
      // exactly one gets past this line (see `reserveClientSlot`). Reserved
      // BEFORE any account exists so a loser leaves nothing behind but a
      // still-usable invite.
      const cap = await reserveClientSlot(inv.coachId);
      if (cap !== 'ok') {
        await unclaim();
        throw capError(cap);
      }

      // Priority: what the client typed on the claim form > what the coach
      // already set when creating the invite > a humanized last resort — a
      // real name should always win over anything derived from the email.
      const claimName = input.displayName?.trim() || inv.displayName?.trim() || humanizeEmailLocalPart(email);
      const userDoc: UserDoc = {
        _id: clientId,
        email,
        emailLower: email,
        passwordHash: await hashPassword(input.password),
        displayName: claimName,
        displayNameLower: claimName.toLowerCase(),
        phone: input.phone.trim(),
        role: 'client',
        accountStatus: 'active',
        permissions: [],
        featureFlags: {},
        createdBy: 'self',
        assignedCoachId: inv.coachId,
        inviteCode: inv._id,
        createdAt: now,
        updatedAt: now,
      };
      const relDoc: CoachClientDoc = {
        _id: relId(inv.coachId, clientId),
        coachId: inv.coachId,
        clientId,
        status: 'active',
        createdBy: clientId,
        inviteCode: inv._id,
        subscription: buildClaimSubscription(inv, now),
        createdAt: now,
        updatedAt: now,
      };

      try {
        await users.insertOne(userDoc);
        const coachClients = await coachClientsCol();
        await coachClients.insertOne(relDoc);
      } catch (joinErr) {
        await users.deleteOne({ _id: clientId }).catch(() => undefined);
        await releaseClientSlot(inv.coachId).catch((e) => console.warn('[invites.claim] slot release rollback failed (non-fatal):', e));
        await unclaim();
        throw joinErr;
      }

      const session = await issueSession(ctx.res, { id: clientId, role: 'client', accountStatus: 'active' });
      // Best-effort — a delivery failure must never fail the join itself.
      const appUrl = ctx.req.headers?.origin || process.env.APP_BASE_URL || 'https://www.useforma.fit';
      sendWelcomeEmail(email, claimName, appUrl).catch((e) => console.error('[invites.claim] failed to send welcome email:', e));
      return { user: toPublicUser(userDoc), accessToken: session.accessToken, relationship: relDoc };
    }),
});
