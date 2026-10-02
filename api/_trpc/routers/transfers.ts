import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { transferClientWithMode } from '../../coach-clients/_service.js';
import { coachClientsCol, relId } from '../../coach-clients/_data.js';
import { transferReqId, transfersCol } from '../../coach-clients/_handlers/transfers-data.js';
import type { ClientTransferRequestDoc } from '../../coach-clients/_handlers/transfers-types.js';

/**
 * A transfer request is only meaningful if `fromCoachId` is the client's
 * CURRENT active coach. Checked on `create` (so a coach can't file a request
 * naming an arbitrary/colluding "from" coach for a client they have nothing
 * to do with) AND again on `accept` (the relationship may have ended or moved
 * between request and approval) — `transferClientWithMode` then re-checks a
 * third time as the last line of defence.
 */
async function assertCurrentCoach(fromCoachId: string, clientId: string): Promise<void> {
  const rels = await coachClientsCol();
  const rel = await rels.findOne({ _id: relId(fromCoachId, clientId) }, { projection: { status: 1 } });
  if (!rel || rel.status !== 'active') {
    throw new TRPCError({ code: 'CONFLICT', message: 'That coach does not currently coach this client' });
  }
}

/** tRPC port of `api/coach-clients/_handlers/transfers-{index,detail}.ts` (was `/api/transfers/*`). */
export const transfersRouter = router({
  /**
   * `incoming` = requests to take over MY clients (I'm fromCoachId).
   * `outgoing` = requests I've made (I'm toCoachId).
   * `pending`  = every pending request platform-wide (admin oversight, requires `coaches.assign`).
   */
  list: authedProcedure.input(z.object({ type: z.enum(['incoming', 'outgoing', 'pending']) })).query(async ({ ctx, input }) => {
    const col = await transfersCol();
    if (input.type === 'pending') {
      if (!hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign')) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return col.find({ status: 'pending' }).sort({ requestedAt: -1 }).toArray();
    }
    if (input.type === 'incoming') {
      return col.find({ fromCoachId: ctx.user.id, status: 'pending' }).sort({ requestedAt: -1 }).toArray();
    }
    return col.find({ toCoachId: ctx.user.id }).sort({ requestedAt: -1 }).toArray();
  }),

  /** A prospective coach (`toCoachId` == self) requests a client owned by another coach (`fromCoachId`). */
  create: protectedProcedure
    .input(
      z.object({
        clientId: z.string().trim().min(1),
        fromCoachId: z.string().trim().min(1),
        reason: z.string().trim().min(1).max(2000),
        mode: z.enum(['fresh_start', 'keep_plans']).optional(),
        subscriptionHandling: z.enum(['keep', 'new', 'expire']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'coach') throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.fromCoachId === ctx.user.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already coach this client' });
      await assertCurrentCoach(input.fromCoachId, input.clientId);

      const col = await transfersCol();
      const id = transferReqId(ctx.user.id, input.clientId);
      const existing = await col.findOne({ _id: id });
      if (existing && existing.status === 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: 'A pending request for this client already exists' });
      }

      const now = Date.now();
      const doc: ClientTransferRequestDoc = {
        _id: id,
        clientId: input.clientId,
        fromCoachId: input.fromCoachId,
        toCoachId: ctx.user.id,
        reason: input.reason,
        status: 'pending',
        requestedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        updatedAt: now,
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.subscriptionHandling ? { subscriptionHandling: input.subscriptionHandling } : {}),
      };
      await col.updateOne({ _id: id }, { $set: doc }, { upsert: true });
      return doc;
    }),

  /**
   * `cancel` : the requesting coach (`toCoachId`) withdraws their own pending request.
   * `accept` : the CURRENT coach (`fromCoachId`) or an admin (`coaches.assign`) approves — the only path
   *            that actually moves the client, via the shared `transferClientWithMode`.
   * `reject` : same permission as accept, but only records the decision.
   */
  resolve: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        action: z.enum(['cancel', 'accept', 'reject']),
        adminNote: z.string().trim().max(2000).optional(),
        // Optional overrides for `accept` (the admin review wizard): when
        // absent, the request's own mode / subscription handling apply.
        mode: z.enum(['fresh_start', 'keep_plans']).optional(),
        subscriptionHandling: z.enum(['keep', 'new', 'expire']).optional(),
        newSubscription: z
          .object({
            status: z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']),
            months: z.number().int().positive().optional(),
            days: z.number().int().positive().optional(),
            trialDays: z.number().int().positive().optional(),
            price: z.number().nonnegative().optional(),
            currency: z.string().trim().max(10).optional(),
            planName: z.string().trim().max(120).optional(),
            billingCycle: z.enum(['weekly', 'monthly', 'quarterly', 'custom']).optional(),
            startAt: z.number().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await transfersCol();
      const reqDoc = await col.findOne({ _id: input.id });
      if (!reqDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer request not found' });
      if (reqDoc.status !== 'pending') throw new TRPCError({ code: 'CONFLICT', message: 'This request has already been resolved' });

      const now = Date.now();
      const canAssign = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');

      // Every resolution is a compare-and-swap on `status: 'pending'` so two
      // concurrent resolutions (double-click, two admins) can never both apply
      // — the loser gets CONFLICT instead of a second, duplicate transfer.
      if (input.action === 'cancel') {
        if (ctx.user.id !== reqDoc.toCoachId) throw new TRPCError({ code: 'FORBIDDEN' });
        const r = await col.updateOne({ _id: input.id, status: 'pending' }, { $set: { status: 'cancelled', updatedAt: now } });
        if (r.matchedCount === 0) throw new TRPCError({ code: 'CONFLICT', message: 'This request has already been resolved' });
        return { ...reqDoc, status: 'cancelled' as const, updatedAt: now };
      }

      if (ctx.user.id !== reqDoc.fromCoachId && !canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      const outcome = input.action === 'accept' ? ('accepted' as const) : ('rejected' as const);
      const effectiveMode = input.mode ?? reqDoc.mode ?? 'keep_plans';
      const effectiveSub = input.subscriptionHandling ?? reqDoc.subscriptionHandling ?? 'keep';

      if (
        outcome === 'accepted' &&
        // Mirror `coachClients.transfer`'s stricter fresh-start gate — the current
        // coach accepting a request they didn't author must not be able to trigger
        // a fresh-start (archive-everything) transfer merely because the REQUESTING
        // coach set `mode: 'fresh_start'` at request-creation time. Only someone who
        // actually holds `clients.writeAll` (super admin) may complete one, exactly
        // as when an admin runs a transfer directly.
        effectiveMode === 'fresh_start' &&
        !hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'clients.writeAll')
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a super admin may complete a fresh-start transfer' });
      }

      const claimed = await col.findOneAndUpdate(
        { _id: input.id, status: 'pending' },
        { $set: { status: outcome, reviewedAt: now, reviewedBy: ctx.user.id, updatedAt: now, ...(input.adminNote ? { adminNote: input.adminNote } : {}) } },
        { returnDocument: 'after' },
      );
      if (!claimed) throw new TRPCError({ code: 'CONFLICT', message: 'This request has already been resolved' });

      if (outcome === 'accepted') {
        try {
          await assertCurrentCoach(reqDoc.fromCoachId, reqDoc.clientId);
          await transferClientWithMode(
            reqDoc.clientId,
            reqDoc.fromCoachId,
            reqDoc.toCoachId,
            effectiveMode,
            effectiveSub,
            ctx.user.id,
            input.newSubscription,
          );
        } catch (e) {
          // The move didn't happen (cap, relationship changed, …) — put the
          // request back so it can be retried once the cause is fixed, rather
          // than leaving it marked 'accepted' with no transfer behind it.
          await col
            .updateOne({ _id: input.id, status: 'accepted' }, { $set: { status: 'pending', reviewedAt: null, reviewedBy: null, updatedAt: Date.now() } })
            .catch(() => undefined);
          throw e;
        }
      }

      return claimed;
    }),
});
