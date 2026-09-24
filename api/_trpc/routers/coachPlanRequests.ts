import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProcedure } from '../trpc.js';
import { withDbTransaction } from '../../_lib/mongodb.js';
import {
  DAY_MS,
  coachPlanRequestsCol,
  coachPlansCol,
  isRequestExpired,
  toPublicPlanRequest,
  type CoachPlanDoc,
  type CoachPlanRequestDoc,
  type PlanHistoryEntry,
  type PlanRequestType,
  type PlanSnapshot,
} from '../../coach-plans/_data.js';
import { getTier } from '../../coach-plans/_handlers/tiers-data.js';
import { usersCol } from '../../_lib/mongodb.js';
import { sendPlanRequestAwaitingEmail, sendPlanRequestConfirmedEmail, sendPlanRequestRejectedEmail } from '../../_lib/email.js';

/** Best-effort — a delivery failure must never fail the underlying mutation. */
async function notifyCoach(coachId: string, send: (email: string, name: string) => Promise<void>): Promise<void> {
  try {
    const user = await (await usersCol()).findOne({ _id: coachId });
    if (user) await send(user.email, user.displayName);
  } catch (e) {
    console.error('[coachPlanRequests] notification email failed (non-fatal):', e);
  }
}

const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Builds an immutable snapshot of a tier's current values — confirmation always applies THIS later, never the live tier at confirm-time. */
export async function buildPlanSnapshot(tierKey: string): Promise<PlanSnapshot | null> {
  const tier = await getTier(tierKey);
  if (!tier) return null;
  return {
    tierKey,
    label: tier.marketingTitle ?? { en: tier.label || tierKey, ar: tier.label || tierKey },
    priceMonthly: tier.priceMonthly,
    currency: tier.currency ?? 'EGP',
    maxClients: tier.maxClients,
    termDays: 30, // paid renewal cycle — no gateway, so this is a fixed manual-renewal term for every paid tier today
  };
}

/** Applies the shared expiry rule to a single request doc, persisting the transition idempotently if it applies. Never touches `CoachPlanDoc`. */
async function withDefensiveExpiry(req: CoachPlanRequestDoc): Promise<CoachPlanRequestDoc> {
  if (!isRequestExpired(req)) return req;
  const col = await coachPlanRequestsCol();
  const now = Date.now();
  const result = await col.findOneAndUpdate(
    { _id: req._id, status: 'awaiting' },
    { $set: { status: 'expired', expiredAt: now } },
    { returnDocument: 'after' },
  );
  return result ?? req;
}

export const coachPlanRequestsRouter = router({
  /** Coach's own current actionable request (awaiting/processing), or their most recently resolved one if none is actionable — powers "My Plan"'s Requested-Plan card. */
  get: roleProcedure('coach').query(async ({ ctx }) => {
    const col = await coachPlanRequestsCol();
    const actionable = await col.findOne({ coachId: ctx.user.id, status: { $in: ['awaiting', 'processing'] } });
    if (actionable) return toPublicPlanRequest(await withDefensiveExpiry(actionable));
    const latest = await col.find({ coachId: ctx.user.id }).sort({ requestedAt: -1 }).limit(1).toArray();
    return latest[0] ? toPublicPlanRequest(latest[0]) : null;
  }),

  /**
   * Coach submits (or replaces) a plan-change request. Auto-cancels any
   * pre-existing actionable request for this coach first — application-level
   * "one awaiting request" policy, backed at the DATABASE level by a partial
   * unique index (`ensurePlanRequestIndexes`) so a concurrent double-submit
   * can never both land in an actionable state.
   */
  submit: roleProcedure('coach')
    .input(z.object({ tierKey: z.string().trim().min(1).max(60), reason: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const snapshot = await buildPlanSnapshot(input.tierKey);
      if (!snapshot) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown plan.' });

      const plans = await coachPlansCol();
      const currentPlan = await plans.findOne({ _id: ctx.user.id });
      const type: PlanRequestType = !currentPlan || currentPlan.plan === 'trial' ? 'trial_upgrade' : 'plan_change';

      const col = await coachPlanRequestsCol();
      const now = Date.now();
      // Cancel any pre-existing actionable request before inserting the new
      // one — the unique index is the real guarantee against a race; this is
      // just the normal "you changed your mind" path.
      await col.updateMany(
        { coachId: ctx.user.id, status: { $in: ['awaiting', 'processing'] } },
        { $set: { status: 'cancelled', cancelledAt: now } },
      );
      const doc: CoachPlanRequestDoc = {
        _id: crypto.randomUUID(),
        coachId: ctx.user.id,
        type,
        requestedTierKey: input.tierKey,
        planSnapshot: snapshot,
        status: 'awaiting',
        requestedAt: now,
        confirmationDeadline: now + CONFIRMATION_WINDOW_MS,
        ...(input.reason ? { reason: input.reason } : {}),
      };
      try {
        await col.insertOne(doc);
      } catch (e) {
        // Duplicate-key from the partial unique index — a concurrent submit won the race.
        if (e instanceof Error && 'code' in e && (e as { code?: number }).code === 11000) {
          throw new TRPCError({ code: 'CONFLICT', message: 'A plan request is already awaiting review.' });
        }
        throw e;
      }
      void notifyCoach(ctx.user.id, (email, name) => sendPlanRequestAwaitingEmail(email, name, snapshot.label.en));
      return toPublicPlanRequest(doc);
    }),

  /** Coach withdraws their OWN still-actionable request. `CoachPlanDoc` is never touched. */
  cancel: roleProcedure('coach').mutation(async ({ ctx }) => {
    const col = await coachPlanRequestsCol();
    const now = Date.now();
    const result = await col.findOneAndUpdate(
      { coachId: ctx.user.id, status: { $in: ['awaiting', 'processing'] } },
      { $set: { status: 'cancelled', cancelledAt: now } },
      { returnDocument: 'after' },
    );
    if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'No actionable plan request found.' });
    return toPublicPlanRequest(result);
  }),

  /** Super admin: every actionable request across all coaches (with defensive expiry applied). */
  listPending: roleProcedure('super_admin').query(async () => {
    const col = await coachPlanRequestsCol();
    const rows = await col.find({ status: { $in: ['awaiting', 'processing'] } }).sort({ requestedAt: -1 }).toArray();
    const resolved = await Promise.all(rows.map(withDefensiveExpiry));
    return resolved.map(toPublicPlanRequest);
  }),

  /**
   * Super admin confirms payment. MUST be atomic end-to-end (both the
   * request resolution AND the CoachPlanDoc snapshot-apply commit together,
   * or neither does) — a request can never reach 'confirmed' while the
   * coach's actual plan failed to update. Real Mongo transaction (confirmed
   * available on this project's Atlas cluster) — every write inside passes
   * the same session.
   */
  confirm: roleProcedure('super_admin')
    .input(z.object({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const result = await withDbTransaction(async (session) => {
        const reqCol = await coachPlanRequestsCol();
        const req = await reqCol.findOneAndUpdate(
          { _id: input.requestId, status: 'awaiting' },
          { $set: { status: 'confirmed', confirmedAt: now, confirmedBy: ctx.user.id } },
          { session, returnDocument: 'after' },
        );
        if (!req) throw new TRPCError({ code: 'CONFLICT', message: 'This request was already resolved.' });

        const plans = await coachPlansCol();
        const historyEntry: PlanHistoryEntry = { at: now, action: 'request.confirmed', detail: req.planSnapshot.tierKey, by: ctx.user.id };
        const set: Partial<CoachPlanDoc> = {
          plan: req.planSnapshot.tierKey,
          status: 'active',
          maxClients: req.planSnapshot.maxClients,
          // Tier-derived (not a manual override) — a later tier-wide
          // `maxClients` edit in `coachPlanTiers.save` will sweep this coach
          // along with everyone else on the tier, same as any other coach.
          maxClientsOverride: false,
          startedAt: now, // paid term starts at CONFIRMATION time, never signup/request time
          endsAt: now + req.planSnapshot.termDays * DAY_MS,
          updatedAt: now,
        };
        await plans.updateOne({ _id: req.coachId }, { $set: set, $push: { history: historyEntry } }, { session, upsert: true });

        // If the trial's own grace period had already pended this account
        // (see `api/cron/enforce-trial-expiry.ts`), confirming payment is
        // exactly what un-pends it — same transaction, so the plan can never
        // activate while the account is still locked out, or vice versa.
        const users = await usersCol();
        await users.updateOne({ _id: req.coachId, accountStatus: 'pending' }, { $set: { accountStatus: 'active', updatedAt: now } }, { session });

        return req;
      });
      // Best-effort, outside the transaction — never blocks the confirmation itself.
      void notifyCoach(result.coachId, (email, name) => sendPlanRequestConfirmedEmail(email, name, result.planSnapshot.label.en));
      return toPublicPlanRequest(result);
    }),

  /** Super admin rejects. `CoachPlanDoc` is NEVER touched — whatever the coach had (Trial or a prior paid plan) stays exactly as it was. */
  reject: roleProcedure('super_admin')
    .input(z.object({ requestId: z.string().min(1), adminNote: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const col = await coachPlanRequestsCol();
      const now = Date.now();
      const result = await col.findOneAndUpdate(
        { _id: input.requestId, status: 'awaiting' },
        { $set: { status: 'rejected', rejectedAt: now, rejectedBy: ctx.user.id, ...(input.adminNote ? { adminNote: input.adminNote } : {}) } },
        { returnDocument: 'after' },
      );
      if (!result) throw new TRPCError({ code: 'CONFLICT', message: 'This request was already resolved.' });
      void notifyCoach(result.coachId, (email, name) => sendPlanRequestRejectedEmail(email, name, result.planSnapshot.label.en, input.adminNote));
      return toPublicPlanRequest(result);
    }),
});
