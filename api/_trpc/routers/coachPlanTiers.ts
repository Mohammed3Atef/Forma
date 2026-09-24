import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, roleProcedure, publicProcedure } from '../trpc.js';
import {
  COACH_PLAN_TIERS,
  SEED_ORDER,
  coachPlanTiersCol,
  getCoreFeatures,
  saveCoreFeatures,
  listTiers,
  normalizeTierKey,
  toPublicTier,
  toPublicPlanTier,
  validateTierInvariants,
  type CoachPlanTierConfigDoc,
} from '../../coach-plans/_handlers/tiers-data.js';
import { coachPlansCol } from '../../coach-plans/_data.js';

const LocalizedTextListInput = z.object({
  en: z.array(z.string().trim().max(200)).min(1).max(20),
  ar: z.array(z.string().trim().max(200)).min(1).max(20),
});

/** tRPC port of `api/coach-plans/_handlers/{tiers-index,tiers-detail}.ts` (was `/api/plan-tiers/*`). */
export const coachPlanTiersRouter = router({
  /**
   * Any signed-in user may read (coaches need labels/caps for their own plan
   * UI; admins need them for overrides) — deliberately `authedProcedure`, no
   * active-status requirement, matching the old REST `tiers-index.ts`.
   */
  list: authedProcedure.input(z.object({ includeArchived: z.boolean().optional() }).optional()).query(async ({ input }) => {
    const tiers = await listTiers(input?.includeArchived ?? false);
    return tiers.map(toPublicTier);
  }),

  /**
   * PUBLIC (pre-auth) — feeds the Marketing pricing section and the signup
   * plan picker. Only `publicVisible && active && !archived` tiers, and only
   * the safe marketing-facing fields (see `toPublicPlanTier`) — never admin
   * notes/audit/internal overrides. Sorted by the existing `order` field
   * (no separate `sortOrder` — see the tier config's own doc comment).
   */
  public: publicProcedure.query(async () => {
    const tiers = await listTiers(false);
    return tiers.filter((t) => t.publicVisible && t.active !== false).map(toPublicPlanTier);
  }),

  /**
   * Create/update a tier (deterministic doc id = key); `archived: true` folds
   * in the old soft-delete route (trial protected). Super-admin-only — this
   * edits GLOBAL pricing/caps that every coach on the tier inherits; the
   * frontend (`AdminPlans.tsx`) already restricts the whole page to super
   * admin, so this tightens the backend to match rather than leaving it
   * reachable by a plain `admin` calling the mutation directly.
   */
  save: roleProcedure('super_admin')
    .input(
      z.object({
        key: z.string().min(1),
        label: z.string().trim().max(120).optional(),
        maxClients: z.number().min(0),
        priceMonthly: z.number().min(0),
        currency: z.string().trim().max(10).optional(),
        order: z.number().optional(),
        active: z.boolean().optional(),
        archived: z.boolean().optional(),
        publicVisible: z.boolean().optional(),
        signupEnabled: z.boolean().optional(),
        highlighted: z.boolean().optional(),
        isDefaultSignupPlan: z.boolean().optional(),
        marketingTitle: z.object({ en: z.string().trim().max(120), ar: z.string().trim().max(120) }).optional(),
        marketingDescription: z.object({ en: z.string().trim().max(500), ar: z.string().trim().max(500) }).optional(),
        marketingFeatures: z
          .object({ en: z.array(z.string().trim().max(200)).max(20), ar: z.array(z.string().trim().max(200)).max(20) })
          .optional(),
        requiresPaymentConfirmation: z.boolean().optional(),
        trialDurationDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = normalizeTierKey(input.key);
      if (!key) throw new TRPCError({ code: 'BAD_REQUEST', message: 'A tier key is required.' });
      if (input.archived && key === 'trial') throw new TRPCError({ code: 'BAD_REQUEST', message: 'The trial tier cannot be removed.' });

      const col = await coachPlanTiersCol();
      const now = Date.now();
      const prev = await col.findOne({ _id: key });
      const doc: CoachPlanTierConfigDoc = {
        _id: key,
        label: (input.label ?? '').trim(),
        maxClients: Math.max(0, Math.floor(input.maxClients)),
        priceMonthly: Math.max(0, Math.round(input.priceMonthly)),
        currency: input.currency?.trim() || 'EGP',
        order: input.order ?? SEED_ORDER[key] ?? 99,
        active: input.archived ? false : (input.active ?? true),
        archived: input.archived ?? false,
        builtIn: key in COACH_PLAN_TIERS,
        publicVisible: input.publicVisible ?? prev?.publicVisible ?? false,
        signupEnabled: input.signupEnabled ?? prev?.signupEnabled ?? false,
        highlighted: input.highlighted ?? prev?.highlighted ?? false,
        isDefaultSignupPlan: input.isDefaultSignupPlan ?? prev?.isDefaultSignupPlan ?? false,
        marketingTitle: input.marketingTitle ?? prev?.marketingTitle,
        marketingDescription: input.marketingDescription ?? prev?.marketingDescription,
        marketingFeatures: input.marketingFeatures ?? prev?.marketingFeatures,
        requiresPaymentConfirmation: input.requiresPaymentConfirmation ?? prev?.requiresPaymentConfirmation ?? false,
        trialDurationDays: input.trialDurationDays ?? prev?.trialDurationDays,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };

      // Atomic invariant check against the FULL resulting tier list (this
      // proposed doc merged in) — never leaves zero/multiple default signup
      // tiers or multiple highlighted tiers, checked BEFORE the write.
      const allOthers = (await listTiers(true)).filter((t) => t._id !== key);
      const invariantError = validateTierInvariants([...allOthers, doc]);
      if (invariantError) throw new TRPCError({ code: 'BAD_REQUEST', message: invariantError });

      await col.replaceOne({ _id: key }, doc, { upsert: true });

      // Propagate this tier's (possibly new) `maxClients` to every coach
      // currently on it — EXCEPT coaches an admin has explicitly given a
      // custom per-coach cap (`maxClientsOverride: true`), whose override
      // must survive a platform-wide tier edit untouched.
      const plans = await coachPlansCol();
      await plans.updateMany(
        { plan: key, maxClientsOverride: { $ne: true } },
        { $set: { maxClients: doc.maxClients, updatedAt: now }, $push: { history: { at: now, action: 'maxClients', detail: `${doc.maxClients} (plan updated)`, by: ctx.user.id } } },
      );

      return toPublicTier(doc);
    }),

  /** Shared "Core features" shown on every plan card — see `getCoreFeatures`'s doc comment. Signed-out readable (feeds the public pricing page); only a super-admin edits it. */
  coreFeatures: publicProcedure.query(() => getCoreFeatures()),

  saveCoreFeatures: roleProcedure('super_admin').input(LocalizedTextListInput).mutation(({ input }) => saveCoreFeatures(input)),
});
