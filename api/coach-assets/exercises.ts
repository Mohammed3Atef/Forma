import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOwningCoach, requireReadContext } from './_lib/access';
import { coachExercisesCol } from './_lib/db';
import { ExerciseBodySchema } from './_lib/schemas';
import type { CoachExerciseDoc } from './_lib/types';
import { handleError, methodGuard } from '../_lib/http';

/** GET /api/coach-assets/exercises?coachId=  — list (own library, or admin oversight read).
 *  POST /api/coach-assets/exercises          — create/replace one (upsert by client-supplied id). */

function toPublic(doc: CoachExerciseDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return { id: _id, ...fields };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { coachId } = await requireReadContext(req);
      const col = await coachExercisesCol();
      const docs = await col.find({ coachId }).toArray();
      docs.sort((a, b) => a.name.localeCompare(b.name));
      res.status(200).json(docs.map(toPublic));
      return;
    }

    methodGuard(req, 'POST');
    const user = await requireOwningCoach(req);
    const body = ExerciseBodySchema.parse(req.body);
    const col = await coachExercisesCol();
    const now = Date.now();
    const existing = await col.findOne({ _id: body.id, coachId: user.id });
    const doc: CoachExerciseDoc = {
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
