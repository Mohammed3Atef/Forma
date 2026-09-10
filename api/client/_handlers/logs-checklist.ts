import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, resolveClientId } from '../_lib/access.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Coach-oversight read of a client's daily checklist (`dailyChecklists`
 * generic-sync collection, one doc per day with id == date — pushed by the
 * client's `habitStore.ts` via SyncEngine, never through this route).
 * Read-only: the coach only views the checklist, never edits it (see
 * coachApi.fetchClientDay / ClientActivityView).
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
      const rec = await syncCol.findOne({ clientId, collection: 'dailyChecklists', recordId: date });
      res.status(200).json(rec?.data ?? null);
      return;
    }
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const recs = await syncCol
      .find({ clientId, collection: 'dailyChecklists' })
      .sort({ recordId: -1 })
      .limit(limit)
      .toArray();
    res.status(200).json(recs.map((r) => r.data));
  } catch (e) {
    handleError(res, e);
  }
}
