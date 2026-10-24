import { TRPCError } from '@trpc/server';
import { router, authedProcedure, roleProcedure } from '../trpc.js';
import { bunnyConfig, isBunnyConfigured, listAllImages } from '../../media/_lib/bunny.js';
import { findFoodImageOrphans } from '../../coach-assets/_lib/foodImageOrphans.js';

/**
 * The JSON side of media: whether uploads are enabled at all (so the UI can
 * hide/disable pickers exactly as it did when it read `VITE_BUNNY_*` itself),
 * and the super-admin gallery listing, which used to walk the storage zone
 * FROM THE BROWSER with the zone password. Binary uploads live in
 * `api/media/[action].ts`.
 */
export const mediaRouter = router({
  status: authedProcedure.query(() => ({ configured: isBunnyConfigured() })),

  listImages: roleProcedure('super_admin').query(async () => {
    if (!isBunnyConfigured()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not configured' });
    return listAllImages();
  }),

  /** B4.1: coach food photos nothing references any more (REPORT ONLY — nothing is deleted). */
  foodImageOrphans: roleProcedure('super_admin').query(async () => {
    const cfg = bunnyConfig();
    if (!cfg) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Media storage is not configured' });
    return findFoodImageOrphans(cfg.cdnUrl);
  }),
});
