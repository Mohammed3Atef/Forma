import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadContext } from './_lib/access';
import { coachFoodGroupsCol } from './_lib/db';
import { FoodGroupBodySchema } from './_lib/schemas';
import type { CoachFoodGroupDoc } from './_lib/types';
import { handleError, methodGuard } from '../_lib/http';

/** GET /api/coach-assets/food-groups?coachId=  — list, newest-updated first.
 *  POST /api/coach-assets/food-groups          — create/replace one (upsert by client-supplied id). */

function toPublic(doc: CoachFoodGroupDoc) {
  const { _id, coachId, ...fields } = doc;
  return { id: _id, coachId, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { coachId } = await requireReadContext(req);
      const col = await coachFoodGroupsCol();
      const docs = await col.find({ coachId }).sort({ updatedAt: -1 }).toArray();
      res.status(200).json(docs.map(toPublic));
      return;
    }

    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const body = FoodGroupBodySchema.parse(req.body);
    const col = await coachFoodGroupsCol();
    const now = Date.now();
    const existing = await col.findOne({ _id: body.id, coachId: user.id });
    const doc: CoachFoodGroupDoc = {
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
