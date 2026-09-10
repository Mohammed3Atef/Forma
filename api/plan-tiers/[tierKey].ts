import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requirePermission, requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { COACH_PLAN_TIERS, coachPlanTiersCol, normalizeTierKey, toPublicTier, type CoachPlanTierConfigDoc } from './_data.js';

const SEED_ORDER: Record<string, number> = { trial: 0, starter: 1, pro: 2, enterprise: 3 };

/** Mirrors `saveCoachPlanTier`'s accepted body shape, plus `archived` (folds in `archiveCoachPlanTier`). */
const Body = z.object({
  label: z.string().trim().max(120).optional(),
  maxClients: z.number().min(0),
  priceMonthly: z.number().min(0),
  currency: z.string().trim().max(10).optional(),
  order: z.number().optional(),
  active: z.boolean().optional(),
  archived: z.boolean().optional(),
});

/**
 * PUT /api/plan-tiers/:tierKey — super-admin-tier write only. firestore.rules
 * gates `coachPlanTiers` create/update/delete on `users.manageStatus`, so this
 * route mirrors that exact permission (rather than requiring `role ===
 * 'super_admin'`, which today's rules do not actually require).
 *
 * Creates or updates a tier (deterministic doc id = key), mirroring
 * `saveCoachPlanTier`. `archived: true` folds in `archiveCoachPlanTier`'s
 * soft-delete (with the same `trial` protection) rather than needing a
 * separate DELETE route.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PUT');
    const user = await requireUser(req);
    requirePermission(user, 'users.manageStatus');

    const rawKey = String(req.query.tierKey ?? '');
    const key = normalizeTierKey(rawKey);
    if (!key) throw new HttpError(400, 'A tier key is required.');

    const body = Body.parse(req.body);
    if (body.archived && key === 'trial') throw new HttpError(400, 'The trial tier cannot be removed.');

    const col = await coachPlanTiersCol();
    const now = Date.now();
    const prev = await col.findOne({ _id: key });
    const doc: CoachPlanTierConfigDoc = {
      _id: key,
      label: (body.label ?? '').trim(),
      maxClients: Math.max(0, Math.floor(body.maxClients)),
      priceMonthly: Math.max(0, Math.round(body.priceMonthly)),
      currency: body.currency?.trim() || 'EGP',
      order: body.order ?? SEED_ORDER[key] ?? 99,
      active: body.archived ? false : (body.active ?? true),
      archived: body.archived ?? false,
      builtIn: key in COACH_PLAN_TIERS,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await col.replaceOne({ _id: key }, doc, { upsert: true });
    res.status(200).json(toPublicTier(doc));
  } catch (e) {
    handleError(res, e);
  }
}
