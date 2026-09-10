import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadContext } from './_lib/access.js';
import { coachNutritionTemplatesCol } from './_lib/db.js';
import { NutritionTemplateBodySchema } from './_lib/schemas.js';
import type { CoachNutritionTemplateDoc } from './_lib/types.js';
import { handleError, methodGuard } from '../_lib/http.js';

/** GET /api/coach-assets/nutrition-templates?coachId=  — list, newest-updated first.
 *  POST /api/coach-assets/nutrition-templates          — create/replace one (upsert by client-supplied id). */

function toPublic(doc: CoachNutritionTemplateDoc) {
  const { _id, coachId, ...fields } = doc;
  return { id: _id, coachId, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { coachId } = await requireReadContext(req);
      const col = await coachNutritionTemplatesCol();
      const docs = await col.find({ coachId }).sort({ updatedAt: -1 }).toArray();
      res.status(200).json(docs.map(toPublic));
      return;
    }

    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const body = NutritionTemplateBodySchema.parse(req.body);
    const col = await coachNutritionTemplatesCol();
    const now = Date.now();
    const existing = await col.findOne({ _id: body.id, coachId: user.id });
    const doc = {
      ...body,
      _id: body.id,
      coachId: user.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } as CoachNutritionTemplateDoc;
    await col.replaceOne({ _id: body.id, coachId: user.id }, doc, { upsert: true });
    res.status(existing ? 200 : 201).json(toPublic(doc));
  } catch (e) {
    handleError(res, e);
  }
}
