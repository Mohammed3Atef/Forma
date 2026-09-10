import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, resolveClientId } from '../_lib/access.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Raw fitness log read for `cardioLogs` (mirrors `SyncEngine`'s `CardioLog`
 * doc — unlike workout/nutrition/weight logs, several sessions may exist per
 * day, so each doc keeps its own generated id). NOT coach-owned and no
 * dedicated coach-write rule — client-own write only; coach/admin(readAll) read only.
 *
 * GET reads from the generic `syncRecords` collection (`api/sync/*`) — see
 * `logs-workout.ts`'s matching comment for why (the client's SyncEngine
 * pushes here via generic sync). Writes happen only through `api/sync/*`;
 * this route is read-only (a formerly-dead PUT/DELETE pair writing to a
 * separate `cardioLogsCol` — never read by this GET — was removed). The
 * cardio record's own `id` (from the client) is stored as `recordId`; its
 * `date` field lives inside the synced `data` blob, not as its own column.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);

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
  } catch (e) {
    handleError(res, e);
  }
}
