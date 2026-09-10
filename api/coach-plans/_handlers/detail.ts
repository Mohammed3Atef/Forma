import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import {
  DAY_MS,
  PAID_TERM_DAYS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_CLIENTS,
  coachPlansCol,
  toPublicCoachPlan,
  type CoachPlanDoc,
  type PlanHistoryEntry,
} from '../_data.js';
import { COACH_PLAN_TIERS, getTier } from './tiers-data.js';

/**
 * PATCH /api/coach-plans/:coachId — admin-only manual override of a coach's
 * plan (tier and/or status and/or maxClients), mirroring the super-admin
 * helpers `setCoachTier` / `setCoachPlanStatus` / `setCoachMaxClients`
 * combined into one route. Gated by `users.manageStatus`, same as
 * firestore.rules' privileged `coachPlans` update rule.
 */
const Body = z
  .object({
    tier: z.string().trim().min(1).max(60).optional(),
    status: z.enum(['active', 'expired', 'suspended']).optional(),
    maxClients: z.number().int().min(0).optional(),
    // Explicit admin-chosen end date override (or `null` to clear it back to
    // "no end date"). Distinct from the `tier` branch below, which derives
    // `endsAt` automatically from the tier's standard term length.
    endsAt: z.number().int().nonnegative().nullable().optional(),
  })
  .refine(
    (b) => b.tier !== undefined || b.status !== undefined || b.maxClients !== undefined || b.endsAt !== undefined,
    { message: 'At least one of tier, status, maxClients, endsAt must be provided.' },
  );

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const user = await requireUser(req);
    requirePermission(user, 'users.manageStatus');
    const coachId = String(req.query.coachId ?? '').trim();
    if (!coachId) throw new HttpError(400, 'Missing coachId.');
    const body = Body.parse(req.body);

    const plans = await coachPlansCol();
    const existing = await plans.findOne({ _id: coachId });
    if (!existing) throw new HttpError(404, 'No plan found for this coach.');

    const now = Date.now();
    const set: Partial<CoachPlanDoc> = { updatedAt: now };
    const history: PlanHistoryEntry[] = [];

    if (body.tier !== undefined) {
      set.plan = body.tier;
      set.endsAt = now + (body.tier === 'trial' ? TRIAL_DURATION_DAYS : PAID_TERM_DAYS) * DAY_MS;
      history.push({ at: now, action: 'tier', detail: body.tier, by: user.id });
    }

    if (body.maxClients !== undefined) {
      const n = Math.max(0, Math.floor(body.maxClients));
      set.maxClients = n;
      history.push({ at: now, action: 'maxClients', detail: String(n), by: user.id });
    } else if (body.tier !== undefined) {
      // Derive the default cap for the new tier from the admin-editable config,
      // falling back to the built-in seed (mirrors `setCoachTier`).
      const tierCfg = await getTier(body.tier);
      set.maxClients = tierCfg?.maxClients ?? COACH_PLAN_TIERS[body.tier]?.maxClients ?? TRIAL_MAX_CLIENTS;
    }

    if (body.status !== undefined) {
      set.status = body.status;
      history.push({ at: now, action: 'status', detail: body.status, by: user.id });
    } else if (body.tier !== undefined) {
      // A tier change (re)activates the plan, mirrors `setCoachTier`.
      set.status = 'active';
    }

    // Explicit end-date override — applied AFTER the tier branch so an
    // admin-chosen date (or an explicit clear-to-null) always wins over the
    // tier branch's auto-derived `endsAt`, even if both were somehow sent
    // together.
    if (body.endsAt !== undefined) {
      set.endsAt = body.endsAt;
      history.push({ at: now, action: 'endsAt', detail: body.endsAt === null ? 'cleared' : String(body.endsAt), by: user.id });
    }

    await plans.updateOne(
      { _id: coachId },
      history.length ? { $set: set, $push: { history: { $each: history } } } : { $set: set },
    );
    const updated = await plans.findOne({ _id: coachId });
    res.status(200).json(toPublicCoachPlan(updated!));
  } catch (e) {
    handleError(res, e);
  }
}
