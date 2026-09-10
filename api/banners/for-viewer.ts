import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActive, requireUser } from '../_lib/withAuth.js';
import { bannersCol, matchesViewer, toPublicBanner, type BannerPlacement } from './_lib.js';
import { handleError, methodGuard } from '../_lib/http.js';

const VALID_PLACEMENTS: BannerPlacement[] = ['all', 'client_home', 'coach_dashboard'];

/** Port of `bannersApi.ts`'s `fetchBannersForViewer()` — banners visible to the calling (signed-in) user right now. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);

    const placementParam = typeof req.query.placement === 'string' ? req.query.placement : 'all';
    const placement = (VALID_PLACEMENTS.includes(placementParam as BannerPlacement) ? placementParam : 'all') as BannerPlacement;

    const col = await bannersCol();
    const docs = await col.find({}).sort({ updatedAt: -1 }).toArray();
    const ctx = { role: user.role, createdAt: user.doc.createdAt, placement };
    const visible = docs.filter((d) => matchesViewer(d, ctx));
    res.status(200).json(visible.map(toPublicBanner));
  } catch (e) {
    handleError(res, e);
  }
}
