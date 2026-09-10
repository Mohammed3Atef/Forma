import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadAccess } from '../_lib/access';
import { coachFoodsCol } from '../_lib/db';
import { FoodBodyPatchSchema } from '../_lib/schemas';
import type { CoachFoodDoc } from '../_lib/types';
import { HttpError, handleError, methodGuard } from '../../_lib/http';
import { requireUser } from '../../_lib/withAuth';

/** GET/PATCH/DELETE /api/coach-assets/foods/:id */

function toPublic(doc: CoachFoodDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return { id: _id, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = req.query.id as string;
    const col = await coachFoodsCol();

    if (req.method === 'GET') {
      const user = await requireUser(req);
      const doc = await col.findOne({ _id: id });
      if (!doc) throw new HttpError(404, 'Food not found');
      requireReadAccess(user, doc.coachId);
      res.status(200).json(toPublic(doc));
      return;
    }

    if (req.method === 'PATCH') {
      const user = await requireOwningCoach(req);
      const patch = FoodBodyPatchSchema.parse(req.body);
      const existing = await col.findOne({ _id: id, coachId: user.id });
      if (!existing) throw new HttpError(404, 'Food not found');
      const updated: CoachFoodDoc = { ...existing, ...patch, updatedAt: Date.now() };
      await col.replaceOne({ _id: id, coachId: user.id }, updated);
      res.status(200).json(toPublic(updated));
      return;
    }

    methodGuard(req, 'DELETE');
    const user = await requireOwningCoach(req);
    const result = await col.deleteOne({ _id: id, coachId: user.id });
    if (result.deletedCount === 0) throw new HttpError(404, 'Food not found');
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
