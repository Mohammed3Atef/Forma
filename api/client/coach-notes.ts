import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { canReadClientData, canWriteCoachOwned, resolveClientId } from './_lib/access.js';
import { coachNotesCol } from './_lib/db.js';
import { notify } from './_lib/notify.js';
import type { CoachNoteDoc } from './_lib/types.js';

/**
 * Port of `coachApi.listCoachNotes/addCoachNote` — `clientData/{clientId}/coachNotes`.
 * `coachNotes` is in `isCoachOwnedColl`: client read-only, only the assigned
 * coach / admin(clients.writeAll) may write (create/update/delete).
 */
const NoteScreenEnum = z.enum(['nutrition', 'workout', 'cardio', 'progress', 'measurements', 'photos']);
const NoteEntityTypeEnum = z.enum([
  'meal',
  'food',
  'water',
  'supplement',
  'exercise',
  'workout_day',
  'cardio_session',
  'measurement',
  'weight_entry',
  'progress_photo',
  'checkin',
]);

const CreateBody = z.object({
  body: z.string().trim().min(1).max(4000),
  kind: z.enum(['note', 'announcement']).optional(),
  screen: NoteScreenEnum.optional(),
  date: z.string().optional(),
  entityType: NoteEntityTypeEnum.optional(),
  entityId: z.string().optional(),
});

const UpdateBody = z.object({ body: z.string().trim().min(1).max(4000) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST', 'PATCH', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await coachNotesCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const list = await col.find({ clientId }).sort({ createdAt: -1 }).limit(50).toArray();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'POST') {
      if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');
      const body = CreateBody.parse(req.body);
      const now = Date.now();
      const note: CoachNoteDoc = {
        _id: crypto.randomUUID(),
        clientId,
        authorId: user.id,
        authorRole: user.role,
        body: body.body,
        kind: body.kind ?? 'note',
        createdAt: now,
        updatedAt: now,
      };
      if (body.screen) note.screen = body.screen;
      if (body.date) note.date = body.date;
      if (body.entityType) note.entityType = body.entityType;
      if (body.entityId) note.entityId = body.entityId;
      await col.insertOne(note);
      await notify({
        clientId,
        forRole: 'client',
        type: 'coach_note',
        body: body.body.trim().slice(0, 140),
        screen: body.screen,
        date: body.date,
        entityType: body.entityType,
        entityId: body.entityId,
        createdBy: user.id,
      });
      res.status(201).json(note);
      return;
    }

    const id = typeof req.query.id === 'string' ? req.query.id : undefined;
    if (!id) throw new HttpError(400, 'id is required');
    if (!(await canWriteCoachOwned(user, clientId))) throw new HttpError(403, 'Forbidden');

    if (req.method === 'PATCH') {
      const body = UpdateBody.parse(req.body);
      const now = Date.now();
      await col.updateOne({ _id: id, clientId }, { $set: { body: body.body, updatedAt: now } });
      const updated = await col.findOne({ _id: id, clientId });
      if (!updated) throw new HttpError(404, 'Note not found');
      res.status(200).json(updated);
      return;
    }

    // DELETE
    await col.deleteOne({ _id: id, clientId });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
