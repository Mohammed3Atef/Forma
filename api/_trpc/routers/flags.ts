import { z } from 'zod';
import { router, permissionProcedure } from '../trpc.js';
import { flagsCol, toPublicFlag, writeFlagAudit } from '../../banners/_handlers/flags-lib.js';

/** tRPC port of `api/banners/_handlers/flags-index.ts`. */
export const flagsRouter = router({
  /**
   * Gated on `flags.manage` (same as `save`) — this was `protectedProcedure`
   * with no permission check at all, so any active client/coach could read
   * every flag doc including its `targetId` (per-coach/per-client targeting
   * data). Nothing in the app actually reads flags outside `AdminGovernance`
   * (confirmed: it's the only frontend caller of `flags.list`), so tightening
   * this doesn't remove any real feature-gating capability.
   */
  list: permissionProcedure('flags.manage').query(async () => {
    const col = await flagsCol();
    const docs = await col.find({}).toArray();
    return docs.map(toPublicFlag);
  }),

  save: permissionProcedure('flags.manage')
    .input(
      z.object({
        id: z.string().trim().min(1).max(120),
        enabled: z.boolean(),
        scope: z.enum(['global', 'coach', 'client']),
        targetId: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await flagsCol();
      const doc = { _id: input.id, enabled: input.enabled, scope: input.scope, targetId: input.targetId, updatedAt: Date.now() };
      await col.replaceOne({ _id: input.id }, doc, { upsert: true });
      await writeFlagAudit(ctx.user, input.id, { flag: input.id, enabled: input.enabled, scope: input.scope });
      return toPublicFlag(doc);
    }),
});
