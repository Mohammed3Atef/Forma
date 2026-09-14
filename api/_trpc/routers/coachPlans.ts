import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure, roleProcedureNoActive, permissionProcedure } from '../trpc.js';
import {
  DAY_MS,
  PAID_TERM_DAYS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_CLIENTS,
  coachPlanChangeRequestsCol,
  coachPlansCol,
  toPublicChangeRequest,
  toPublicCoachPlan,
  type CoachPlanDoc,
  type PlanHistoryEntry,
} from '../../coach-plans/_data.js';
import { COACH_PLAN_TIERS, getTier } from '../../coach-plans/_handlers/tiers-data.js';

/** tRPC port of `api/coach-plans/_handlers/{me,trial,detail,change-request,admin-plan-change-requests}.ts`. */
export const coachPlansRouter = router({
  /** The signed-in coach's own Layer-A plan. Deliberately no active-status requirement — matches the old REST `me.ts`. */
  me: roleProcedureNoActive('coach').query(async ({ ctx }) => {
    const plans = await coachPlansCol();
    const doc = await plans.findOne({ _id: ctx.user.id });
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan found for this coach yet.' });
    return toPublicCoachPlan(doc);
  }),

  /** Creates the auto-trial plan for a newly self-signed-up coach. Idempotent — never downgrades an existing plan. Deliberately no active-status requirement — matches the old REST `trial.ts`. */
  createTrial: roleProcedureNoActive('coach').mutation(async ({ ctx }) => {
    const plans = await coachPlansCol();
    const existing = await plans.findOne({ _id: ctx.user.id });
    if (existing) return toPublicCoachPlan(existing);
    const now = Date.now();
    const doc: CoachPlanDoc = {
      _id: ctx.user.id,
      plan: 'trial',
      status: 'active',
      maxClients: TRIAL_MAX_CLIENTS,
      startedAt: now,
      endsAt: now + TRIAL_DURATION_DAYS * DAY_MS,
      trialNotified: {},
      activeClientCount: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await plans.insertOne(doc);
    return toPublicCoachPlan(doc);
  }),

  /** Admin-only manual override of a coach's plan (tier and/or status and/or maxClients and/or endsAt). */
  adminUpdate: permissionProcedure('users.manageStatus')
    .input(
      z
        .object({
          coachId: z.string().min(1),
          tier: z.string().trim().min(1).max(60).optional(),
          status: z.enum(['active', 'expired', 'suspended']).optional(),
          maxClients: z.number().int().min(0).optional(),
          endsAt: z.number().int().nonnegative().nullable().optional(),
        })
        .refine((b) => b.tier !== undefined || b.status !== undefined || b.maxClients !== undefined || b.endsAt !== undefined, {
          message: 'At least one of tier, status, maxClients, endsAt must be provided.',
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const plans = await coachPlansCol();
      const existing = await plans.findOne({ _id: input.coachId });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan found for this coach.' });

      const now = Date.now();
      const set: Partial<CoachPlanDoc> = { updatedAt: now };
      const history: PlanHistoryEntry[] = [];

      if (input.tier !== undefined) {
        set.plan = input.tier;
        set.endsAt = now + (input.tier === 'trial' ? TRIAL_DURATION_DAYS : PAID_TERM_DAYS) * DAY_MS;
        history.push({ at: now, action: 'tier', detail: input.tier, by: ctx.user.id });
      }

      if (input.maxClients !== undefined) {
        const n = Math.max(0, Math.floor(input.maxClients));
        set.maxClients = n;
        history.push({ at: now, action: 'maxClients', detail: String(n), by: ctx.user.id });
      } else if (input.tier !== undefined) {
        const tierCfg = await getTier(input.tier);
        set.maxClients = tierCfg?.maxClients ?? COACH_PLAN_TIERS[input.tier]?.maxClients ?? TRIAL_MAX_CLIENTS;
      }

      if (input.status !== undefined) {
        set.status = input.status;
        history.push({ at: now, action: 'status', detail: input.status, by: ctx.user.id });
      } else if (input.tier !== undefined) {
        set.status = 'active';
      }

      if (input.endsAt !== undefined) {
        set.endsAt = input.endsAt;
        history.push({ at: now, action: 'endsAt', detail: input.endsAt === null ? 'cleared' : String(input.endsAt), by: ctx.user.id });
      }

      await plans.updateOne({ _id: input.coachId }, history.length ? { $set: set, $push: { history: { $each: history } } } : { $set: set });
      const updated = await plans.findOne({ _id: input.coachId });
      return toPublicCoachPlan(updated!);
    }),

  /** Coach requests a tier/cap change. Upserts the singleton request doc, always resetting to 'pending'. */
  submitChangeRequest: roleProcedure('coach')
    .input(
      z.object({
        requestedTier: z.string().trim().min(1).max(60).optional(),
        requestedMaxClients: z.number().int().positive().optional(),
        reason: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reqs = await coachPlanChangeRequestsCol();
      const now = Date.now();
      const doc = {
        _id: ctx.user.id,
        coachId: ctx.user.id,
        reason: input.reason,
        status: 'pending' as const,
        requestedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        updatedAt: now,
        ...(input.requestedTier ? { requestedTier: input.requestedTier } : {}),
        ...(input.requestedMaxClients ? { requestedMaxClients: Math.max(0, Math.floor(input.requestedMaxClients)) } : {}),
      };
      await reqs.replaceOne({ _id: ctx.user.id }, doc, { upsert: true });
      return toPublicChangeRequest(doc);
    }),

  /** Coach withdraws their OWN still-pending request. */
  cancelChangeRequest: roleProcedure('coach').mutation(async ({ ctx }) => {
    const reqs = await coachPlanChangeRequestsCol();
    const existing = await reqs.findOne({ _id: ctx.user.id });
    if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan-change request found.' });
    if (existing.status !== 'pending') {
      throw new TRPCError({ code: 'CONFLICT', message: 'This request has already been resolved and can no longer be cancelled.' });
    }
    const now = Date.now();
    await reqs.updateOne({ _id: ctx.user.id }, { $set: { status: 'cancelled', reviewedAt: now, reviewedBy: ctx.user.id, updatedAt: now } });
    const updated = await reqs.findOne({ _id: ctx.user.id });
    return toPublicChangeRequest(updated!);
  }),

  /** Admin: every pending plan-change request across all coaches. */
  listPendingChangeRequests: permissionProcedure('users.manageStatus').query(async () => {
    const reqs = await coachPlanChangeRequestsCol();
    const pending = await reqs.find({ status: 'pending' }).toArray();
    return pending.map(toPublicChangeRequest);
  }),

  /** Admin: accept/reject a coach's plan-change request. Accepting applies the requested tier/cap. */
  resolveChangeRequest: permissionProcedure('users.manageStatus')
    .input(z.object({ coachId: z.string().min(1), decision: z.enum(['accepted', 'rejected']), adminNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const reqsCol = await coachPlanChangeRequestsCol();
      const existing = await reqsCol.findOne({ _id: input.coachId });
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan-change request found for this coach.' });
      const now = Date.now();
      const adminNote = (input.adminNote ?? '').trim();

      if (input.decision === 'accepted') {
        const plansCol = await coachPlansCol();
        const plan = await plansCol.findOne({ _id: input.coachId });
        const tier = existing.requestedTier;
        let maxClients = existing.requestedMaxClients ?? plan?.maxClients ?? TRIAL_MAX_CLIENTS;
        if (existing.requestedMaxClients === undefined && tier) {
          const tierCfg = await getTier(tier);
          maxClients = tierCfg?.maxClients ?? COACH_PLAN_TIERS[tier]?.maxClients ?? maxClients;
        }
        const historyEntry: PlanHistoryEntry = { at: now, action: 'request.accepted', detail: adminNote.slice(0, 120), by: ctx.user.id };
        await plansCol.updateOne(
          { _id: input.coachId },
          {
            $set: {
              ...(tier ? { plan: tier } : {}),
              maxClients,
              status: 'active',
              endsAt: now + (tier === 'trial' ? TRIAL_DURATION_DAYS : PAID_TERM_DAYS) * DAY_MS,
              updatedAt: now,
            },
            $push: { history: historyEntry },
          },
        );
      } else {
        const historyEntry: PlanHistoryEntry = { at: now, action: 'request.rejected', detail: adminNote.slice(0, 120), by: ctx.user.id };
        await (await coachPlansCol())
          .updateOne({ _id: input.coachId }, { $set: { updatedAt: now }, $push: { history: historyEntry } })
          .catch(() => undefined);
      }

      await reqsCol.updateOne(
        { _id: input.coachId },
        { $set: { status: input.decision, reviewedAt: now, reviewedBy: ctx.user.id, adminNote, updatedAt: now } },
      );
      const updated = await reqsCol.findOne({ _id: input.coachId });
      return toPublicChangeRequest(updated!);
    }),

  /** Admin: clear/dismiss a coach's plan-change request doc outright (not currently called by the frontend; kept for parity with the old REST route). */
  dismissChangeRequest: permissionProcedure('users.manageStatus')
    .input(z.object({ coachId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const reqsCol = await coachPlanChangeRequestsCol();
      await reqsCol.deleteOne({ _id: input.coachId });
    }),
});
