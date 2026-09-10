import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, resolveClientId } from '../_lib/access.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Raw fitness log read for `workoutLogs` (mirrors `SyncEngine`'s `WorkoutLog`
 * doc, one per day, at Firestore's `clientData/{clientId}/workoutLogs/{date}`).
 * NOT in `isCoachOwnedColl` and no dedicated coach-write rule exists for it —
 * so unlike measurementLogs/notifications, only the client themself may write;
 * the assigned coach / admin(clients.readAll) may only read.
 *
 * GET reads from the generic `syncRecords` collection (`api/sync/*`) — the
 * client's SyncEngine pushes workout logs there (as one of its generic synced
 * collections). Writes happen only through `api/sync/*`; this route is
 * read-only (a formerly-dead PUT/DELETE pair writing to a separate
 * `workoutLogsCol` — never read by this GET — was removed).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);

    if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');
    const syncCol = await syncRecordsCol();
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (date) {
      const rec = await syncCol.findOne({ clientId, collection: 'workoutLogs', recordId: date });
      res.status(200).json(rec?.data ?? null);
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const recs = await syncCol
      .find({ clientId, collection: 'workoutLogs' })
      .sort({ recordId: -1 })
      .limit(limit)
      .toArray();
    res.status(200).json(recs.map((r) => r.data));
  } catch (e) {
    handleError(res, e);
  }
}
