import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { issueSession } from '../../_lib/tokens.js';
import { toPublicUser, type UserDoc } from '../../_lib/types.js';
import { bumpActiveClientCount, coachAtClientCap, coachClientsCol, relId } from '../../coach-clients/_data.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';
import { DEFAULT_TTL_MS, buildClaimSubscription, generateInviteCode, invitesCol, isClaimable, normalizeCode } from '../../coach-clients/_handlers/invites-data.js';
import type { SignupInviteDoc } from '../../coach-clients/_handlers/invites-types.js';

const SubscriptionStatusEnum = z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']);
const BillingCycleEnum = z.enum(['weekly', 'monthly', 'quarterly', 'custom']);

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
      return created;
    }),

  /** PUBLIC (pre-auth) lookup for the claim screen. The code is the capability — no list/enumerate procedure exists. */
  getByCode: publicProcedure.input(z.object({ code: z.string().min(1) })).query(async ({ input }) => {
    const code = normalizeCode(input.code);
    const col = await invitesCol();
    const invite = await col.findOne({ _id: code });
    if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
    return { ...invite, claimable: isClaimable(invite) };
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
    await col.updateOne({ _id: code }, { $set: { status: 'revoked' } });
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
      if (await coachAtClientCap(inv.coachId)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This coach has reached their client limit' });
      }

      const now = Date.now();
      const clientId = crypto.randomUUID();

      const claimResult = await invites.findOneAndUpdate(
        { _id: code, status: 'pending', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $set: { status: 'claimed', claimedByUid: clientId, claimedAt: now } },
      );
      if (!claimResult) throw new TRPCError({ code: 'CONFLICT', message: 'This invite was just claimed by someone else' });

      const claimName = input.displayName?.trim() || email.split('@')[0];
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
        await invites
          .updateOne({ _id: code }, { $set: { status: 'pending' }, $unset: { claimedByUid: '', claimedAt: '' } })
          .catch((e) => console.warn('[invites.claim] unclaim rollback failed (non-fatal):', e));
        throw joinErr;
      }

      await bumpActiveClientCount(inv.coachId, 1);
      const session = await issueSession(ctx.res, { id: clientId, role: 'client', accountStatus: 'active' });
      return { user: toPublicUser(userDoc), accessToken: session.accessToken, relationship: relDoc };
    }),
});
