import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, permissionProcedure } from '../trpc.js';
import {
  COACH_PLAN_TIERS,
  SEED_ORDER,
  coachPlanTiersCol,
  listTiers,
  normalizeTierKey,
  toPublicTier,
  type CoachPlanTierConfigDoc,
} from '../../coach-plans/_handlers/tiers-data.js';

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

  /** Create/update a tier (deterministic doc id = key); `archived: true` folds in the old soft-delete route (trial protected). */
  save: permissionProcedure('users.manageStatus')
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
      }),
    )
    .mutation(async ({ input }) => {
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
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
      };
      await col.replaceOne({ _id: key }, doc, { upsert: true });
      return toPublicTier(doc);
    }),
});
