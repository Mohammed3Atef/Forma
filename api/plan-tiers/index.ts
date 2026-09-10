import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { listTiers, toPublicTier } from './_data.js';

/**
 * GET /api/plan-tiers — any signed-in user may read (coaches need labels/caps
 * for their own plan UI; admins need them for overrides). Mirrors
 * `listCoachPlanTiers`. Pass `?includeArchived=1` to include archived tiers.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    await requireUser(req);
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    const tiers = await listTiers(includeArchived);
    res.status(200).json(tiers.map(toPublicTier));
  } catch (e) {
    handleError(res, e);
  }
}
