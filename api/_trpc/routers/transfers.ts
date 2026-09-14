import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { transferClientWithMode } from '../../coach-clients/_service.js';
import { transferReqId, transfersCol } from '../../coach-clients/_handlers/transfers-data.js';
import type { ClientTransferRequestDoc } from '../../coach-clients/_handlers/transfers-types.js';

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
    .input(z.object({ id: z.string().min(1), action: z.enum(['cancel', 'accept', 'reject']), adminNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const col = await transfersCol();
      const reqDoc = await col.findOne({ _id: input.id });
      if (!reqDoc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer request not found' });
      if (reqDoc.status !== 'pending') throw new TRPCError({ code: 'CONFLICT', message: 'This request has already been resolved' });

      const now = Date.now();
      const canAssign = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');

      if (input.action === 'cancel') {
        if (ctx.user.id !== reqDoc.toCoachId) throw new TRPCError({ code: 'FORBIDDEN' });
        await col.updateOne({ _id: input.id }, { $set: { status: 'cancelled', updatedAt: now } });
        return { ...reqDoc, status: 'cancelled' as const, updatedAt: now };
      }

      if (ctx.user.id !== reqDoc.fromCoachId && !canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      const outcome = input.action === 'accept' ? ('accepted' as const) : ('rejected' as const);

      if (outcome === 'accepted') {
        await transferClientWithMode(
          reqDoc.clientId,
          reqDoc.fromCoachId,
          reqDoc.toCoachId,
          reqDoc.mode ?? 'keep_plans',
          reqDoc.subscriptionHandling ?? 'keep',
          ctx.user.id,
        );
      }

      await col.updateOne(
        { _id: input.id },
        { $set: { status: outcome, reviewedAt: now, reviewedBy: ctx.user.id, updatedAt: now, ...(input.adminNote ? { adminNote: input.adminNote } : {}) } },
      );
      return { ...reqDoc, status: outcome, reviewedAt: now, reviewedBy: ctx.user.id, updatedAt: now };
    }),
});
