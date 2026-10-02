import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, roleProcedure, publicProcedure } from '../trpc.js';
import { withDbTransaction } from '../../_lib/mongodb.js';
import { writeAuditTx } from '../../admin/_lib/audit.js';
import { coachPlansCol } from '../../coach-plans/_data.js';
import {
  FORMA_ID,
  formaConfigCol,
  getFormaConfig,
  toFormaConfig,
  toPublicForma,
  trialLimitOf,
  validateFormaConfig,
  type FormaConfigDoc,
} from '../../coach-plans/_handlers/forma.js';

const LText = (max: number) => z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });

/**
 * The ONE Forma product configuration (router name kept for wire
 * compatibility). There are no tiers to list, choose or change — see
 * `coach-plans/_handlers/forma.ts`.
 */
export const coachPlanTiersRouter = router({
  /**
   * PUBLIC (signed-out) — feeds the marketing pricing card and signup copy.
   * Always an array of at most ONE plan (empty when the Super Admin hides
   * Forma from the public site). Capacity add-ons are never included.
   */
  public: publicProcedure.query(async () => {
    const cfg = await getFormaConfig();
    return cfg.publicVisible ? [toPublicForma(cfg)] : [];
  }),

  /** Full config for any signed-in user (coach My Plan shows price/term/base limit; admins edit it). */
  get: authedProcedure.query(async () => toFormaConfig(await getFormaConfig())),

  /**
   * Super Admin edits the Forma configuration. Validated before the write.
   * Existing coaches are protected: a change NEVER reduces anyone's capacity —
   * a HIGHER base limit is applied to every coach whose current base is
   * lower (same transaction, effective limit recomputed in the same update);
   * a LOWER base limit applies only to future Trials / new subscription
   * requests. Price/term changes never touch existing requests (they carry
   * their own snapshot) or running terms.
   */
  save: roleProcedure('super_admin')
    .input(
      z.object({
        label: z.string().trim().min(1).max(60).optional(),
        trialEnabled: z.boolean(),
        trialDurationDays: z.number().int().min(1).max(365),
        trialClientLimit: z.number().int().min(1).max(100_000).nullable(),
        maxClients: z.number().int().min(1).max(100_000),
        priceMonthly: z.number().min(0).max(10_000_000),
        currency: z.string().trim().min(1).max(10),
        termDays: z.number().int().min(1).max(366),
        publicVisible: z.boolean(),
        signupEnabled: z.boolean(),
        marketingTitle: LText(120),
        marketingDescription: LText(500),
        marketingFeatures: z.object({ en: z.array(z.string().trim().min(1).max(200)).max(30), ar: z.array(z.string().trim().min(1).max(200)).max(30) }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const result = await withDbTransaction(async (session) => {
        const prev = await getFormaConfig(session);
        const doc: FormaConfigDoc = {
          ...prev,
          ...input,
          _id: FORMA_ID,
          label: input.label ?? prev.label,
          billingInterval: 'month',
          priceMonthly: Math.round(input.priceMonthly * 100) / 100,
          currency: input.currency.toUpperCase(),
          createdAt: prev.createdAt || now,
          updatedAt: now,
        };
        const err = validateFormaConfig(doc);
        if (err) throw new TRPCError({ code: 'BAD_REQUEST', message: err });
        await (await formaConfigCol()).replaceOne({ _id: FORMA_ID }, doc, { upsert: true, session });

        // Increase-only propagation of the included client limit.
        const plans = await coachPlansCol();
        const raise = async (filter: Record<string, unknown>, target: number) => {
          const r = await plans.updateMany(
            { ...filter, $expr: { $lt: [{ $ifNull: ['$baseMaxClients', '$maxClients'] }, target] } },
            [
              { $set: { baseMaxClients: target, addonClientCapacity: { $ifNull: ['$addonClientCapacity', 0] }, manualCapacityAdjustment: { $ifNull: ['$manualCapacityAdjustment', 0] } } },
              { $set: { maxClients: { $max: [0, { $add: ['$baseMaxClients', '$addonClientCapacity', '$manualCapacityAdjustment'] }] }, updatedAt: now } },
            ],
            { session },
          );
          return r.modifiedCount;
        };
        const raisedTrial = trialLimitOf(doc) > trialLimitOf(prev) ? await raise({ plan: 'trial' }, trialLimitOf(doc)) : 0;
        const raisedPaid = doc.maxClients > prev.maxClients ? await raise({ plan: { $ne: 'trial' } }, doc.maxClients) : 0;
        await writeAuditTx(ctx.user, 'forma.config_updated', ctx.user.id, {
          before: { maxClients: prev.maxClients, trialClientLimit: prev.trialClientLimit, priceMonthly: prev.priceMonthly, currency: prev.currency, termDays: prev.termDays, trialEnabled: prev.trialEnabled, trialDurationDays: prev.trialDurationDays },
          after: { maxClients: doc.maxClients, trialClientLimit: doc.trialClientLimit, priceMonthly: doc.priceMonthly, currency: doc.currency, termDays: doc.termDays, trialEnabled: doc.trialEnabled, trialDurationDays: doc.trialDurationDays },
          raisedTrialCoaches: raisedTrial,
          raisedPaidCoaches: raisedPaid,
        }, session);
        return { config: toFormaConfig(doc), raisedTrialCoaches: raisedTrial, raisedPaidCoaches: raisedPaid };
      });
      return result;
    }),
});
