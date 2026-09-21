import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, authedProcedure } from '../trpc.js';
import { hasPermission } from '../../_lib/rbac.js';
import { coachClientsCol } from '../../coach-clients/_data.js';
import { assignExistingClient, endRelationship, transferClientWithMode, updateSubscription, type SubscriptionAction } from '../../coach-clients/_service.js';
import type { ClientSubscriptionInput } from '../../coach-clients/_types.js';
import { usersCol } from '../../_lib/mongodb.js';
import { toPublicUser } from '../../_lib/types.js';
import { syncRecordsCol } from '../../sync/_data.js';
import { clientProfilesCol, checkInsCol } from '../../client/_lib/db.js';
import type { ClientAssessmentFields } from '../../client/_lib/types.js';

/** Mirrors `assessmentStatus()` in `src/lib/assessment.ts` — keep in sync. */
function assessmentStatusOf(a: ClientAssessmentFields | undefined): 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review' {
  if (!a) return 'not_started';
  return a.status ?? (a.completed ? 'submitted' : 'in_progress');
}

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

const SubscriptionStatusEnum = z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']);
const BillingCycleEnum = z.enum(['weekly', 'monthly', 'quarterly', 'custom']);

const ClientSubscriptionInputSchema = z.object({
  status: SubscriptionStatusEnum,
  months: z.number().int().positive().optional(),
  days: z.number().int().positive().optional(),
  trialDays: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().trim().max(10).optional(),
  planName: z.string().trim().max(120).optional(),
  billingCycle: BillingCycleEnum.optional(),
  startAt: z.number().optional(),
});

const SubscriptionActionSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('setTerm'),
    startAt: z.number(),
    months: z.number().int().positive().optional(),
    days: z.number().int().positive().optional(),
    price: z.number().nonnegative().optional(),
    currency: z.string().trim().max(10).optional(),
    planName: z.string().trim().max(120).optional(),
  }),
  z.object({ op: z.literal('setPrice'), price: z.number().nonnegative(), currency: z.string().trim().max(10).optional() }),
  z.object({ op: z.literal('freeze'), from: z.number(), until: z.number(), note: z.string().trim().max(500).optional() }),
  z.object({ op: z.literal('unfreeze') }),
  z.object({ op: z.literal('end') }),
  z.object({ op: z.literal('cancel') }),
  z.object({ op: z.literal('extend'), days: z.number().int().positive() }),
]);

function parseId(id: string): { coachId: string; clientId: string } {
  const sep = id.indexOf('__');
  if (sep <= 0 || sep === id.length - 2) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Malformed relationship id' });
  return { coachId: id.slice(0, sep), clientId: id.slice(sep + 2) };
}

/** tRPC port of `api/coach-clients/_handlers/{index,detail}.ts`. */
export const coachClientsRouter = router({
  /**
   * `?coachId=` : that coach's relationships (self, or `users.read`), filtered by `status` (default `active`).
   * `?clientId=`: that client's full history, newest first (self, their assigned coach, or `users.read`).
   * neither     : "my own" list — a coach's active roster, or a client's own coaching history.
   */
  list: authedProcedure
    .input(
      z.object({
        coachId: z.string().trim().min(1).optional(),
        clientId: z.string().trim().min(1).optional(),
        status: z.enum(['active', 'ended', 'pending', 'all']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
      const col = await coachClientsCol();

      if (input.clientId) {
        const all = await col.find({ clientId: input.clientId }).sort({ createdAt: -1 }).toArray();
        if (ctx.user.id !== input.clientId && !canReadAll && !all.some((r) => r.coachId === ctx.user.id)) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return all;
      }

      if (input.coachId) {
        if (ctx.user.id !== input.coachId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
        const filter: Record<string, unknown> = { coachId: input.coachId };
        if (input.status && input.status !== 'all') filter.status = input.status;
        else if (!input.status) filter.status = 'active';
        return col.find(filter).sort({ createdAt: -1 }).toArray();
      }

      if (ctx.user.role === 'coach') {
        const filter: Record<string, unknown> = { coachId: ctx.user.id };
        filter.status = input.status && input.status !== 'all' ? input.status : 'active';
        return col.find(filter).sort({ createdAt: -1 }).toArray();
      }
      if (ctx.user.role === 'client') {
        return col.find({ clientId: ctx.user.id }).sort({ createdAt: -1 }).toArray();
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'coachId or clientId is required' });
    }),

  /**
   * A coach's client roster with user profiles already joined — one round trip
   * instead of the relationship list plus one `adminUsers.get` per client
   * (`listMyClients` in `coachApi.ts` used to do exactly that N+1). Same
   * authorization as `list`'s `coachId` branch: self, or an admin with
   * `users.read`.
   */
  listMyClientUsers: authedProcedure
    .input(z.object({ coachId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
      const coachId = input.coachId ?? ctx.user.id;
      if (ctx.user.id !== coachId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
      const col = await coachClientsCol();
      const rels = await col.find({ coachId, status: 'active' }).sort({ createdAt: -1 }).toArray();
      if (rels.length === 0) return [];
      const clientIds = [...new Set(rels.map((r) => r.clientId))];
      const users = await usersCol();
      const docs = await users.find({ _id: { $in: clientIds } }).toArray();
      const byId = new Map(docs.map((d) => [d._id, toPublicUser(d)]));
      // Preserve relationship order (newest-assigned first) and drop any client
      // whose user record has since been removed rather than erroring.
      return rels.map((r) => byId.get(r.clientId)).filter((u): u is NonNullable<typeof u> => !!u);
    }),

  /**
   * Per-client dashboard summary (workouts in the last 7 days, latest finished
   * activity date, assessment status, submitted-check-in flag) for every one of
   * a coach's active clients, in three bounded queries total — no matter how
   * many clients. Replaces what used to be three per-client reads
   * (`workoutLogs.list` + `assessment.get` + `checkIns.list`) fanned out over
   * every client. Feeds the coach dashboard AND `CoachAdherence` (workouts7d)
   * AND `CoachAssessments` (assessment) — one summary, three screens, per the
   * performance closeout's "don't build three near-identical endpoints" ask.
   * Same authorization as `listMyClientUsers`.
   */
  dashboardSummaries: authedProcedure
    .input(z.object({ coachId: z.string().trim().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
      const coachId = input.coachId ?? ctx.user.id;
      if (ctx.user.id !== coachId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
      const relCol = await coachClientsCol();
      const rels = await relCol.find({ coachId, status: 'active' }).toArray();
      const clientIds = [...new Set(rels.map((r) => r.clientId))];
      if (clientIds.length === 0) return [];

      const since = cutoff(7);
      const syncCol = await syncRecordsCol();
      const profilesCol = await clientProfilesCol();
      const checkinsCol = await checkInsCol();

      const [workoutRows, profileDocs, submittedClientIds] = await Promise.all([
        syncCol
          .aggregate<{ _id: string; workouts7d: number; lastActivity: string | null }>([
            { $match: { clientId: { $in: clientIds }, collection: 'workoutLogs', 'data.finished': true } },
            { $group: { _id: '$clientId', workouts7d: { $sum: { $cond: [{ $gte: ['$data.date', since] }, 1, 0] } }, lastActivity: { $max: '$data.date' } } },
          ])
          .toArray(),
        profilesCol.find({ _id: { $in: clientIds } }).toArray(),
        checkinsCol.distinct('clientId', { clientId: { $in: clientIds }, status: 'submitted' }),
      ]);

      const workoutByClient = new Map(workoutRows.map((r) => [r._id, r]));
      const profileByClient = new Map(profileDocs.map((d) => [d.clientId, d]));
      const toReviewSet = new Set(submittedClientIds);

      return clientIds.map((clientId) => {
        const w = workoutByClient.get(clientId);
        const profile = profileByClient.get(clientId);
        const fullName = profile?.assessment?.basic?.fullName?.trim() || null;
        return {
          clientId,
          workouts7d: w?.workouts7d ?? 0,
          lastActivity: w?.lastActivity ?? null,
          assessment: assessmentStatusOf(profile?.assessment),
          fullName,
          toReview: toReviewSet.has(clientId),
        };
      });
    }),

  get: authedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const col = await coachClientsCol();
    const doc = await col.findOne({ _id: input.id });
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relationship not found' });
    const canReadAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'users.read');
    if (ctx.user.id !== doc.coachId && ctx.user.id !== doc.clientId && !canReadAll) throw new TRPCError({ code: 'FORBIDDEN' });
    return doc;
  }),

  /** CASE 1 — a coach (or an admin with `coaches.assign`) assigns an UNASSIGNED existing client to a coach, with a required subscription. */
  assign: protectedProcedure
    .input(z.object({ clientId: z.string().trim().min(1), coachId: z.string().trim().min(1).optional(), subscription: ClientSubscriptionInputSchema }))
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
      return assignExistingClient(coachId, input.clientId, ctx.user.id, input.subscription as ClientSubscriptionInput);
    }),

  /** The owning coach releases their own client, or an admin (`coaches.assign`) unassigns one. */
  end: protectedProcedure
    .input(z.object({ id: z.string().min(1), reason: z.enum(['released', 'unassigned']).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { coachId, clientId } = parseId(input.id);
      const canAssign = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');
      const isOwningCoach = ctx.user.role === 'coach' && coachId === ctx.user.id;
      if (!isOwningCoach && !canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      const endReason = input.reason ?? (isOwningCoach ? 'released' : 'unassigned');
      return endRelationship(coachId, clientId, ctx.user.id, endReason);
    }),

  /** The owning coach (or an admin with `clients.writeAll`) mutates an EXISTING relationship's subscription in place. */
  updateSubscription: protectedProcedure
    .input(z.object({ id: z.string().min(1), sub: SubscriptionActionSchema }))
    .mutation(async ({ ctx, input }) => {
      const { coachId, clientId } = parseId(input.id);
      const isOwningCoach = ctx.user.role === 'coach' && coachId === ctx.user.id;
      const canWriteAll = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'clients.writeAll');
      if (!isOwningCoach && !canWriteAll) throw new TRPCError({ code: 'FORBIDDEN' });
      return updateSubscription(coachId, clientId, input.sub as SubscriptionAction);
    }),

  /** Admin-only reassignment (`coaches.assign`; `clients.writeAll` additionally required for `mode: 'fresh_start'`). */
  transfer: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        toCoachId: z.string().trim().min(1),
        mode: z.enum(['fresh_start', 'keep_plans']),
        subscriptionHandling: z.enum(['keep', 'new', 'expire']),
        newSubscription: ClientSubscriptionInputSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { coachId, clientId } = parseId(input.id);
      const canAssign = hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'coaches.assign');
      if (!canAssign) throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.mode === 'fresh_start' && !hasPermission(ctx.user.role, ctx.user.accountStatus, ctx.user.permissions, 'clients.writeAll')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only a super admin may perform a fresh-start transfer' });
      }
      return transferClientWithMode(
        clientId,
        coachId,
        input.toCoachId,
        input.mode,
        input.subscriptionHandling,
        ctx.user.id,
        input.newSubscription as ClientSubscriptionInput | undefined,
      );
    }),
});
