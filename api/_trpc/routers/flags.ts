import { z } from 'zod';
import { router, protectedProcedure, permissionProcedure } from '../trpc.js';
import { flagsCol, toPublicFlag, writeFlagAudit } from '../../banners/_handlers/flags-lib.js';

/** tRPC port of `api/banners/_handlers/flags-index.ts`. */
export const flagsRouter = router({
  list: protectedProcedure.query(async () => {
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
