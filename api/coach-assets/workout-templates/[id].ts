import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadAccess } from '../_lib/access.js';
import { coachWorkoutTemplatesCol } from '../_lib/db.js';
import { WorkoutTemplateBodyPatchSchema } from '../_lib/schemas.js';
import type { CoachWorkoutTemplateDoc } from '../_lib/types.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { requireUser } from '../../_lib/withAuth.js';

/** GET/PATCH/DELETE /api/coach-assets/workout-templates/:id */

function toPublic(doc: CoachWorkoutTemplateDoc) {
  const { _id, coachId, ...fields } = doc;
  return { id: _id, coachId, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = req.query.id as string;
    const col = await coachWorkoutTemplatesCol();

    if (req.method === 'GET') {
      const user = await requireUser(req);
      const doc = await col.findOne({ _id: id });
      if (!doc) throw new HttpError(404, 'Workout template not found');
      requireReadAccess(user, doc.coachId);
      res.status(200).json(toPublic(doc));
      return;
    }

    if (req.method === 'PATCH') {
      const user = await requireOwningCoach(req);
      const patch = WorkoutTemplateBodyPatchSchema.parse(req.body);
      const existing = await col.findOne({ _id: id, coachId: user.id });
      if (!existing) throw new HttpError(404, 'Workout template not found');
      const updated = { ...existing, ...patch, updatedAt: Date.now() } as CoachWorkoutTemplateDoc;
      await col.replaceOne({ _id: id, coachId: user.id }, updated);
      res.status(200).json(toPublic(updated));
      return;
    }

    methodGuard(req, 'DELETE');
    const user = await requireOwningCoach(req);
    const result = await col.deleteOne({ _id: id, coachId: user.id });
    if (result.deletedCount === 0) throw new HttpError(404, 'Workout template not found');
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
