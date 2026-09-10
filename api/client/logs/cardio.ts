import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, isActiveSelf, resolveClientId } from '../_lib/access.js';
import { cardioLogsCol } from '../_lib/db.js';
import type { CardioLogDoc } from '../_lib/types.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Raw fitness log CRUD for `cardioLogs` (mirrors `SyncEngine`'s `CardioLog`
 * doc — unlike workout/nutrition/weight logs, several sessions may exist per
 * day, so each doc keeps its own generated id). NOT coach-owned and no
 * dedicated coach-write rule — client-own write only; coach/admin(readAll) read only.
 *
 * GET reads from the generic `syncRecords` collection (`api/sync/*`), NOT the
 * dedicated `cardioLogsCol` below — see `workout.ts`'s matching comment for
 * why (the client's SyncEngine pushes here via generic sync, never PUT). The
 * cardio record's own `id` (from the client) is stored as `recordId`; its
 * `date` field lives inside the synced `data` blob, not as its own column.
 */
const Body = z.object({
  id: z.string().optional(),
  date: z.string(),
  type: z.enum(['walking', 'treadmill', 'running', 'cycling', 'other']),
  durationSec: z.number(),
  distanceKm: z.number().nullable().optional(),
  caloriesBurned: z.number().nullable().optional(),
  steps: z.number().nullable().optional(),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT', 'DELETE');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    const col = await cardioLogsCol();

    if (req.method === 'GET') {
      if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
      const syncCol = await syncRecordsCol();
      const id = typeof req.query.id === 'string' ? req.query.id : undefined;
      if (id) {
        const rec = await syncCol.findOne({ clientId, collection: 'cardioLogs', recordId: id });
        res.status(200).json(rec?.data ?? null);
        return;
      }
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const filter: Record<string, unknown> = { clientId, collection: 'cardioLogs' };
      if (date) filter['data.date'] = date;
      const limit = Math.min(Number(req.query.limit) || 120, 500);
      const recs = await syncCol.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
      res.status(200).json(recs.map((r) => r.data));
      return;
    }

    if (req.method === 'PUT') {
      if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
      const body = Body.parse(req.body);
      const now = Date.now();
      const _id = body.id ?? crypto.randomUUID();
      const doc: CardioLogDoc = {
        _id,
        clientId,
        date: body.date,
        type: body.type,
        durationSec: body.durationSec,
        distanceKm: body.distanceKm ?? null,
        caloriesBurned: body.caloriesBurned ?? null,
        steps: body.steps ?? null,
        updatedAt: now,
      };
      await col.replaceOne({ _id }, doc, { upsert: true });
      res.status(200).json(doc);
      return;
    }

    // DELETE
    const id = typeof req.query.id === 'string' ? req.query.id : undefined;
    if (!id) throw new HttpError(400, 'id is required');
    if (!isActiveSelf(user, clientId)) throw new HttpError(403, 'Forbidden');
    await col.deleteOne({ _id: id, clientId });
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
