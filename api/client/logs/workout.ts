import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, isActiveSelf, resolveClientId } from '../_lib/access.js';
import { workoutLogsCol } from '../_lib/db.js';
import type { WorkoutLogDoc } from '../_lib/types.js';

/**
 * Raw fitness log CRUD for `workoutLogs` (mirrors `SyncEngine`'s `WorkoutLog`
 * doc, one per day, at Firestore's `clientData/{clientId}/workoutLogs/{date}`).
 * NOT in `isCoachOwnedColl` and no dedicated coach-write rule exists for it —
 * so unlike measurementLogs/notifications, only the client themself may write;
 * the assigned coach / admin(clients.readAll) may only read.
 */
const SetLog = z.object({
  setIndex: z.number(),
  type: z.enum(['warmup', 'working']),
  targetReps: z.string(),
  actualReps: z.number().nullable(),
  weightKg: z.number().nullable(),
  rpe: z.number().nullable(),
  done: z.boolean(),
});

const ExerciseLog = z.object({ exerciseId: z.string(), sets: z.array(SetLog), done: z.boolean() });

const Body = z.object({
  date: z.string(),
  dayId: z.string(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  durationSec: z.number(),
  exercises: z.array(ExerciseLog),
  finished: z.boolean(),
});

function logId(clientId: string, date: string): string {
  return `${clientId}__${date}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await workoutLogsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      if (date) {
        const doc = await col.findOne({ _id: logId(clientId, date) });
        res.status(200).json(doc ?? null);
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 30, 200);
      const list = await col.find({ clientId }).sort({ date: -1 }).limit(limit).toArray();
      res.status(200).json(list);
      return;
    }

    if (req.method === 'PUT') {
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const body = Body.parse(req.body);
      const now = Date.now();
      const doc: WorkoutLogDoc = { _id: logId(clientId, body.date), clientId, ...body, updatedAt: now };
      await col.replaceOne({ _id: doc._id }, doc, { upsert: true });
      res.status(200).json(doc);
      return;
    }

    // DELETE
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!date) throw new HttpError(400, 'date is required');
    if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
    await col.deleteOne({ _id: logId(clientId, date) });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
