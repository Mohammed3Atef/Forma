import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, isActiveSelf, resolveClientId } from '../_lib/access.js';
import { weightLogsCol } from '../_lib/db.js';
import type { WeightLogDoc } from '../_lib/types.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Raw fitness log CRUD for `weightLogs` (mirrors `SyncEngine`'s `WeightLog`
 * doc, one per day). NOT coach-owned and no dedicated coach-write rule —
 * client-own write only; coach/admin(readAll) read only.
 *
 * GET reads from the generic `syncRecords` collection (`api/sync/*`), NOT the
 * dedicated `weightLogsCol` below — see `workout.ts`'s matching comment for
 * why (the client's SyncEngine pushes here via generic sync, never PUT).
 */
const Body = z.object({ date: z.string(), weightKg: z.number() });

function logId(clientId: string, date: string): string {
  return `${clientId}__${date}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await weightLogsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const syncCol = await syncRecordsCol();
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      if (date) {
        const rec = await syncCol.findOne({ clientId, collection: 'weightLogs', recordId: date });
        res.status(200).json(rec?.data ?? null);
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 120, 500);
      const recs = await syncCol
        .find({ clientId, collection: 'weightLogs' })
        .sort({ recordId: -1 })
        .limit(limit)
        .toArray();
      res.status(200).json(recs.map((r) => r.data));
      return;
    }

    if (req.method === 'PUT') {
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const body = Body.parse(req.body);
      const now = Date.now();
      const doc: WeightLogDoc = { _id: logId(clientId, body.date), clientId, date: body.date, weightKg: body.weightKg, updatedAt: now };
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
