import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, isActiveSelf, resolveClientId } from '../_lib/access.js';
import { nutritionLogsCol } from '../_lib/db.js';
import type { NutritionLogDoc } from '../_lib/types.js';

/**
 * Raw fitness log CRUD for `nutritionLogs` (mirrors `SyncEngine`'s
 * `NutritionLog` doc, one per day). NOT coach-owned and no dedicated
 * coach-write rule — client-own write only; coach/admin(readAll) read only.
 */
const Body = z.object({
  date: z.string(),
  mealsEaten: z.record(z.string(), z.boolean()).default({}),
  supplementsTaken: z.record(z.string(), z.boolean()).default({}),
  customFoods: z.array(z.record(z.string(), z.unknown())).default([]),
  itemOverrides: z.record(z.string(), z.record(z.string(), z.unknown()).nullable()).default({}),
  substitutions: z
    .record(z.string(), z.object({ source: z.enum(['approved_substitution', 'client_custom_substitution']), pendingApproval: z.boolean().optional() }))
    .optional(),
  extraItems: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))).default({}),
  waterMl: z.number().default(0),
  creatineTaken: z.boolean().default(false),
});

function logId(clientId: string, date: string): string {
  return `${clientId}__${date}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await nutritionLogsCol();

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
      const doc = { _id: logId(clientId, body.date), clientId, ...body, updatedAt: now } as NutritionLogDoc;
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
