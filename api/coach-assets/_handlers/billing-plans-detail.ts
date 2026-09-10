import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadAccess } from '../_lib/access.js';
import { coachBillingPlansCol } from '../_lib/db.js';
import { BillingPlanBodyPatchSchema } from '../_lib/schemas.js';
import type { CoachBillingPlanDoc } from '../_lib/types.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { requireUser } from '../../_lib/withAuth.js';

/** GET/PATCH/DELETE /api/coach-assets/billing-plans/:id */

function toPublic(doc: CoachBillingPlanDoc) {
  const { _id, coachId, ...fields } = doc;
  return { id: _id, coachId, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = req.query.id as string;
    const col = await coachBillingPlansCol();

    if (req.method === 'GET') {
      const user = await requireUser(req);
      const doc = await col.findOne({ _id: id });
      if (!doc) throw new HttpError(404, 'Billing plan not found');
      requireReadAccess(user, doc.coachId);
      res.status(200).json(toPublic(doc));
      return;
    }

    if (req.method === 'PATCH') {
      const user = await requireOwningCoach(req);
      const patch = BillingPlanBodyPatchSchema.parse(req.body);
      const existing = await col.findOne({ _id: id, coachId: user.id });
      if (!existing) throw new HttpError(404, 'Billing plan not found');
      const updated = { ...existing, ...patch, updatedAt: Date.now() } as CoachBillingPlanDoc;
      await col.replaceOne({ _id: id, coachId: user.id }, updated);
      res.status(200).json(toPublic(updated));
      return;
    }

    methodGuard(req, 'DELETE');
    const user = await requireOwningCoach(req);
    const result = await col.deleteOne({ _id: id, coachId: user.id });
    if (result.deletedCount === 0) throw new HttpError(404, 'Billing plan not found');
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
