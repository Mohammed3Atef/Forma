import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { recordId, syncDeletionsCol } from '../_data.js';

const Body = z.object({
  deletions: z.array(
    z.object({
      collection: z.string().min(1).max(60),
      id: z.string().min(1),
      deletedAt: z.number(),
    }),
  ),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    const body = Body.parse(req.body);
    const col = await syncDeletionsCol();
    const recordsCol = (await import('../_data.js')).syncRecordsCol;
    const syncedAt = Date.now();
    for (const del of body.deletions) {
      await col.updateOne(
        { _id: recordId(user.id, del.collection, del.id) },
        { $set: { clientId: user.id, collection: del.collection, recordId: del.id, deletedAt: del.deletedAt, syncedAt } },
        { upsert: true },
      );
      // Remove the live record too, so a subsequent pull of the data
      // collection doesn't resurrect it on another device.
      await (await recordsCol()).deleteOne({ _id: recordId(user.id, del.collection, del.id) });
    }
    res.status(200).json({ flushed: body.deletions.length, syncedAt });
  } catch (e) {
    handleError(res, e);
  }
}
