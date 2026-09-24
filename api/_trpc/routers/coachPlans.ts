import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure, roleProcedureNoActive } from '../trpc.js';
import {
  DAY_MS,
  PAID_TERM_DAYS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_CLIENTS,
  coachPlansCol,
  ensureTrialPlan,
  toPublicCoachPlan,
  type CoachPlanDoc,
  type PlanHistoryEntry,
} from '../../coach-plans/_data.js';
import { COACH_PLAN_TIERS, getTier } from '../../coach-plans/_handlers/tiers-data.js';

/**
 * tRPC port of `api/coach-plans/_handlers/{me,trial,detail}.ts`. Plan-request
 * lifecycle (submit/cancel/list/confirm/reject) lives in
 * `coachPlanRequests.ts` now — the old singleton `coachPlanChangeRequests`
 * flow that used to live here has been retired/replaced.
 */
export const coachPlansRouter = router({
  /** The signed-in coach's own Layer-A plan. Deliberately no active-status requirement — matches the old REST `me.ts`. */
  me: roleProcedureNoActive('coach').query(async ({ ctx }) => {
    const plans = await coachPlansCol();
    const doc = await plans.findOne({ _id: ctx.user.id });
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan found for this coach yet.' });
    return toPublicCoachPlan(doc);
  }),

  /** Creates the auto-trial plan for a newly self-signed-up coach. Idempotent — never downgrades an existing plan. Deliberately no active-status requirement — matches the old REST `trial.ts`. Kept for any legacy/direct caller; `auth.signup` now assigns this itself via `ensureTrialPlan`. */
  createTrial: roleProcedureNoActive('coach').mutation(async ({ ctx }) => {
    const doc = await ensureTrialPlan(ctx.user.id);
    return toPublicCoachPlan(doc);
  }),

  /**
   * Super-admin-only manual override of a coach's plan (tier/status/maxClients/
   * endsAt). Was gated on `users.manageStatus` (held by plain `admin` too) while
   * the entire frontend UI for this — AdminCoachDetail, AdminPlans — is
   * super_admin-only; tightened to match, since this can rewrite any coach's
   * SaaS plan/limits and a plain admin calling it directly would otherwise
   * bypass the UI's own intended boundary.
   */
  adminUpdate: roleProcedure('super_admin')
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

      // Renew/Extend Trial (AdminCoachDetail) re-send the coach's CURRENT tier
      // purely to push `endsAt` forward (see the tier block above) — that must
      // never silently reset a coach's custom `maxClients` override back to
      // the tier's default. Only a genuine tier CHANGE recomputes the cap.
      const tierActuallyChanged = input.tier !== undefined && input.tier !== existing.plan;
      if (input.maxClients !== undefined) {
        // An explicit per-coach cap — this is now an OVERRIDE: it survives
        // future tier-wide `maxClients` edits from `coachPlanTiers.save`
        // (which only sweep coaches that are NOT overridden).
        const n = Math.max(0, Math.floor(input.maxClients));
        set.maxClients = n;
        set.maxClientsOverride = true;
        history.push({ at: now, action: 'maxClients', detail: String(n), by: ctx.user.id });
      } else if (tierActuallyChanged) {
        // A genuine tier switch always follows that tier's CURRENT cap and
        // clears any prior override — the coach is now tier-derived again.
        const tierCfg = await getTier(input.tier!);
        set.maxClients = tierCfg?.maxClients ?? COACH_PLAN_TIERS[input.tier!]?.maxClients ?? TRIAL_MAX_CLIENTS;
        set.maxClientsOverride = false;
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
});
