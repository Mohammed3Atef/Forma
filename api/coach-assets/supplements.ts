import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadContext } from './_lib/access.js';
import { coachSupplementsCol } from './_lib/db.js';
import { SupplementBodySchema } from './_lib/schemas.js';
import type { CoachSupplementDoc } from './_lib/types.js';
import { handleError, methodGuard } from '../_lib/http.js';

/** GET /api/coach-assets/supplements?coachId=  — list, sorted by name.
 *  POST /api/coach-assets/supplements          — create/replace one (upsert by client-supplied id). */

function toPublic(doc: CoachSupplementDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return { id: _id, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { coachId } = await requireReadContext(req);
      const col = await coachSupplementsCol();
      const docs = await col.find({ coachId }).toArray();
      docs.sort((a, b) => a.name.localeCompare(b.name));
      res.status(200).json(docs.map(toPublic));
      return;
    }

    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const body = SupplementBodySchema.parse(req.body);
    const col = await coachSupplementsCol();
    const now = Date.now();
    const existing = await col.findOne({ _id: body.id, coachId: user.id });
    const doc: CoachSupplementDoc = {
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
