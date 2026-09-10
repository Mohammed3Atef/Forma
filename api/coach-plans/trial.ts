import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole, requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import {
  DAY_MS,
  TRIAL_DURATION_DAYS,
  TRIAL_MAX_CLIENTS,
  coachPlansCol,
  toPublicCoachPlan,
  type CoachPlanDoc,
} from './_data.js';

/**
 * POST /api/coach-plans/trial — creates the auto-trial plan for a newly
 * self-signed-up coach. Mirrors `createTrialPlan`: idempotent — if the coach
 * already has a plan (of any tier, even upgraded/paid), this is a no-op that
 * returns the existing plan with 200, never downgrading it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    requireRole(user, 'coach');
    const plans = await coachPlansCol();
    const existing = await plans.findOne({ _id: user.id });
    if (existing) {
      res.status(200).json(toPublicCoachPlan(existing));
      return;
    }
    const now = Date.now();
    const doc: CoachPlanDoc = {
      _id: user.id,
      plan: 'trial',
      status: 'active',
      maxClients: TRIAL_MAX_CLIENTS,
      startedAt: now,
      endsAt: now + TRIAL_DURATION_DAYS * DAY_MS,
      trialNotified: {},
      activeClientCount: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    await plans.insertOne(doc);
    res.status(201).json(toPublicCoachPlan(doc));
  } catch (e) {
    handleError(res, e);
  }
}
