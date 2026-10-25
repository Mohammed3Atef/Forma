import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, roleProcedure } from '../trpc.js';
import { bunnyConfig, isBunnyConfigured, listAllImages } from '../../media/_lib/bunny.js';
import { findFoodImageOrphans } from '../../coach-assets/_lib/foodImageOrphans.js';
import { deliveryConfig, personalMedia, signPath } from '../../media/_lib/delivery.js';
import { canSeePersonalMedia } from '../../media/_lib/mediaAccess.js';
import { findPersonalMediaOrphans } from '../../media/_lib/personalOrphans.js';

/**
 * The JSON side of media: whether uploads are enabled at all (so the UI can
 * hide/disable pickers exactly as it did when it read `VITE_BUNNY_*` itself),
 * and the super-admin gallery listing, which used to walk the storage zone
 * FROM THE BROWSER with the zone password. Binary uploads live in
 * `api/media/[action].ts`.
 */
export const mediaRouter = router({
  /** Uploads on? And (MD-02) does the server sign personal media — then clients ask `sign` for it. */
  status: authedProcedure.query(() => ({ configured: isBunnyConfigured(), signedDelivery: !!deliveryConfig() })),

  /**
   * MD-02 (B4.3; dormant until `BUNNY_URL_TOKEN_KEY` is set): short-lived signed URLs for the
   * personal media in `urls` that this viewer may see (`canSeePersonalMedia`); anything else is
   * left out. A mutation only so a batch of URLs travels in the body.
   */
  sign: authedProcedure.input(z.object({ urls: z.array(z.string().max(2048)).max(100) })).mutation(async ({ ctx, input }) => {
    const cfg = deliveryConfig();
    const signed: Record<string, { url: string; expires: number }> = {};
    if (!cfg) return { enabled: false, signed };
    const decided = new Map<string, boolean>();
    for (const url of new Set(input.urls)) {
      const m = personalMedia(url, cfg.cdn);
      if (!m) continue;
      const key = `${m.ownerId}:${m.category}`;
      let ok = decided.get(key);
      if (ok === undefined) decided.set(key, (ok = await canSeePersonalMedia(ctx.user, m.ownerId, m.category)));
      if (ok) signed[url] = signPath(m.path, cfg);
    }
    return { enabled: true, signed };
  }),

  listImages: roleProcedure('super_admin').query(async () => {
    if (!isBunnyConfigured()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not configured' });
    return listAllImages();
  }),

  /** MD-03 (B4.3): personal media nothing references any more — incl. deleted messages' attachments (REPORT ONLY). */
  personalMediaOrphans: roleProcedure('super_admin').query(async () => {
    const cfg = bunnyConfig();
    if (!cfg) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not configured' });
    return findPersonalMediaOrphans(cfg.cdnUrl);
  }),

  /** B4.1: coach food photos nothing references any more (REPORT ONLY — nothing is deleted). */
  foodImageOrphans: roleProcedure('super_admin').query(async () => {
    const cfg = bunnyConfig();
    if (!cfg) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not configured' });
    return findFoodImageOrphans(cfg.cdnUrl);
  }),
});
