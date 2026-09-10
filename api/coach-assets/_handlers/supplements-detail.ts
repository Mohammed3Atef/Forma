import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadAccess } from '../_lib/access.js';
import { coachSupplementsCol } from '../_lib/db.js';
import { SupplementBodyPatchSchema } from '../_lib/schemas.js';
import type { CoachSupplementDoc } from '../_lib/types.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { requireUser } from '../../_lib/withAuth.js';

/** GET/PATCH/DELETE /api/coach-assets/supplements/:id */

function toPublic(doc: CoachSupplementDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return { id: _id, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = req.query.id as string;
    const col = await coachSupplementsCol();

    if (req.method === 'GET') {
      const user = await requireUser(req);
      const doc = await col.findOne({ _id: id });
      if (!doc) throw new HttpError(404, 'Supplement not found');
      requireReadAccess(user, doc.coachId);
      res.status(200).json(toPublic(doc));
      return;
    }

    if (req.method === 'PATCH') {
      const user = await requireOwningCoach(req);
      const patch = SupplementBodyPatchSchema.parse(req.body);
      const existing = await col.findOne({ _id: id, coachId: user.id });
      if (!existing) throw new HttpError(404, 'Supplement not found');
      const updated = { ...existing, ...patch, updatedAt: Date.now() } as CoachSupplementDoc;
      await col.replaceOne({ _id: id, coachId: user.id }, updated);
      res.status(200).json(toPublic(updated));
      return;
    }

    methodGuard(req, 'DELETE');
    const user = await requireOwningCoach(req);
    const result = await col.deleteOne({ _id: id, coachId: user.id });
    if (result.deletedCount === 0) throw new HttpError(404, 'Supplement not found');
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
