import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { canReadClientData, resolveClientId } from '../_lib/access.js';
import { syncRecordsCol } from '../../sync/_data.js';

/**
 * Coach-oversight read of a client's progress photos. These live in the
 * generic `progressPhotos` sync collection (`api/sync/*`, see SyncEngine /
 * `photoStore.ts`) — the client's device pushes them there, never through
 * this route. Read-only: the coach only views photos, never writes them
 * (see coachApi.fetchClientPhotos / CoachViewPhotos).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const clientId = resolveClientId(req, user);
    if (!(await canReadClientData(user, clientId))) throw new HttpError(403, 'Forbidden');

    const syncCol = await syncRecordsCol();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const recs = await syncCol
      .find({ clientId, collection: 'progressPhotos' })
      .sort({ 'data.date': -1 })
      .limit(limit)
      .toArray();
    res.status(200).json(recs.map((r) => r.data));
  } catch (e) {
    handleError(res, e);
  }
}
