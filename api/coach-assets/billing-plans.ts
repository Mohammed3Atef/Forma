import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadContext } from './_lib/access';
import { coachBillingPlansCol } from './_lib/db';
import { BillingPlanBodySchema } from './_lib/schemas';
import type { CoachBillingPlanDoc } from './_lib/types';
import { handleError, methodGuard } from '../_lib/http';

/**
 * GET /api/coach-assets/billing-plans?coachId=  — list, ordered by `order` ascending
 *   (the coach's Layer-B plan picker; unrelated to the coach's own `coachPlans` subscription).
 * POST /api/coach-assets/billing-plans          — create/replace one (upsert by client-supplied id).
 */

function toPublic(doc: CoachBillingPlanDoc) {
  const { _id, coachId, ...fields } = doc;
  return { id: _id, coachId, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { coachId } = await requireReadContext(req);
      const col = await coachBillingPlansCol();
      const docs = await col.find({ coachId }).toArray();
      docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      res.status(200).json(docs.map(toPublic));
      return;
    }

    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const body = BillingPlanBodySchema.parse(req.body);
    const col = await coachBillingPlansCol();
    const now = Date.now();
    const existing = await col.findOne({ _id: body.id, coachId: user.id });
    const doc: CoachBillingPlanDoc = {
      ...body,
      _id: body.id,
      coachId: user.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await col.replaceOne({ _id: body.id, coachId: user.id }, doc, { upsert: true });
    res.status(existing ? 200 : 201).json(toPublic(doc));
  } catch (e) {
    handleError(res, e);
  }
}
