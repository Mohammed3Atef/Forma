import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { coachPlansCol, toPublicCoachPlan } from '../_data.js';

/** GET /api/coach-plans/me — the signed-in coach's own Layer-A plan. Mirrors `getCoachPlan`. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireRole(user, 'coach');
    const plans = await coachPlansCol();
    const doc = await plans.findOne({ _id: user.id });
    if (!doc) throw new HttpError(404, 'No plan found for this coach yet.');
    res.status(200).json(toPublicCoachPlan(doc));
  } catch (e) {
    handleError(res, e);
  }
}
