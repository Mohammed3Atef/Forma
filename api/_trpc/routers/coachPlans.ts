import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure, roleProcedureNoActive } from '../trpc.js';
import { withDbTransaction } from '../../_lib/mongodb.js';
import { writeAuditTx } from '../../admin/_lib/audit.js';
import { coachPlansCol, ensureTrialPlan, toPublicCoachPlan, type CoachPlanDoc, type PlanHistoryEntry } from '../../coach-plans/_data.js';

/**
 * The coach's own Forma subscription doc. Requests live in
 * `coachPlanRequests`; capacity / renew / grant actions in `coachCommercial`.
 */
export const coachPlansRouter = router({
  /** The signed-in coach's own plan. No active-status requirement — an expired/pended coach must still reach My Plan. */
  me: roleProcedureNoActive('coach').query(async ({ ctx }) => {
    const plans = await coachPlansCol();
    const doc = await plans.findOne({ _id: ctx.user.id });
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan found for this coach yet.' });
    return toPublicCoachPlan(doc);
  }),

  /** Idempotent Trial bootstrap (never resets an existing plan). `auth.signup` already does this; kept for legacy callers. */
  createTrial: roleProcedureNoActive('coach').mutation(async ({ ctx }) => toPublicCoachPlan(await ensureTrialPlan(ctx.user.id))),

  /**
   * Super Admin: status (suspend / reactivate / expire) and term end date.
   * There are no tiers to switch and capacity has its own audited actions
   * (`coachCommercial.*`) — this never edits client limits.
   */
  adminUpdate: roleProcedure('super_admin')
    .input(
      z
        .object({
          coachId: z.string().min(1),
          status: z.enum(['active', 'expired', 'suspended']).optional(),
          endsAt: z.number().int().nonnegative().nullable().optional(),
          reason: z.string().trim().max(500).optional(),
        })
        .refine((b) => b.status !== undefined || b.endsAt !== undefined, { message: 'Provide status and/or endsAt.' }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const updated = await withDbTransaction(async (session) => {
        const plans = await coachPlansCol();
        const existing = await plans.findOne({ _id: input.coachId }, { session });
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan found for this coach.' });
        const set: Partial<CoachPlanDoc> = { updatedAt: now };
        const history: PlanHistoryEntry[] = [];
        if (input.status !== undefined) {
          set.status = input.status;
          history.push({ at: now, action: 'status', detail: input.status, by: ctx.user.id });
        }
        if (input.endsAt !== undefined) {
          set.endsAt = input.endsAt;
          history.push({ at: now, action: 'endsAt', detail: input.endsAt === null ? 'cleared' : String(input.endsAt), by: ctx.user.id });
          // Extending a lapsed term (e.g. "Extend Trial") re-opens it unless a status was given explicitly.
          if (input.status === undefined && existing.status === 'expired' && (input.endsAt === null || input.endsAt > now)) set.status = 'active';
        }
        await plans.updateOne({ _id: input.coachId }, { $set: set, $push: { history: { $each: history } } }, { session });
        await writeAuditTx(ctx.user, 'subscription.admin_updated', input.coachId, {
          before: { status: existing.status, endsAt: existing.endsAt },
          after: { status: set.status ?? existing.status, endsAt: set.endsAt === undefined ? existing.endsAt : set.endsAt },
          reason: input.reason ?? null,
        }, session);
        return (await plans.findOne({ _id: input.coachId }, { session }))!;
      });
      return toPublicCoachPlan(updated);
    }),
});
