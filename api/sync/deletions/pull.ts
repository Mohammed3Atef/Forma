import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth';
import { handleError, methodGuard } from '../../_lib/http';
import { syncDeletionsCol } from '../_data';

const Query = z.object({ since: z.coerce.number().min(0).default(0) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const q = Query.parse(req.query);
    const col = await syncDeletionsCol();
    const docs = await col
      .find({ clientId: user.id, ...(q.since > 0 ? { syncedAt: { $gt: q.since } } : {}) })
      .toArray();
    let maxSyncedAt = q.since;
    const deletions = docs.map((d) => {
      maxSyncedAt = Math.max(maxSyncedAt, d.syncedAt);
      return { collection: d.collection, id: d.recordId, deletedAt: d.deletedAt };
    });
    res.status(200).json({ deletions, maxSyncedAt });
  } catch (e) {
    handleError(res, e);
  }
}
