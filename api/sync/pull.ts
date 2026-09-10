import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { syncRecordsCol } from './_data.js';

const Query = z.object({
  collection: z.string().min(1).max(60),
  since: z.coerce.number().min(0).default(0),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    const q = Query.parse(req.query);
    const col = await syncRecordsCol();
    const cursor = col.find({
      clientId: user.id,
      collection: q.collection,
      ...(q.since > 0 ? { syncedAt: { $gt: q.since } } : {}),
    });
    const docs = await cursor.toArray();
    let maxSyncedAt = q.since;
    const records = docs.map((d) => {
      maxSyncedAt = Math.max(maxSyncedAt, d.syncedAt);
      return { id: d.recordId, updatedAt: d.updatedAt, data: d.data };
    });
    res.status(200).json({ records, maxSyncedAt });
  } catch (e) {
    handleError(res, e);
  }
}
