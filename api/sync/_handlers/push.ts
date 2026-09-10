import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../../_lib/withAuth.js';
import { handleError, methodGuard } from '../../_lib/http.js';
import { recordId, syncRecordsCol } from '../_data.js';

const Body = z.object({
  collection: z.string().min(1).max(60),
  records: z.array(
    z.object({
      id: z.string().min(1),
      updatedAt: z.number(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
});

/** Bulk upsert of dirty local records for one synced collection. One server timestamp for the whole batch. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    const body = Body.parse(req.body);
    const col = await syncRecordsCol();
    const syncedAt = Date.now();
    for (const rec of body.records) {
      await col.updateOne(
        { _id: recordId(user.id, body.collection, rec.id) },
        {
          $set: {
            clientId: user.id,
            collection: body.collection,
            recordId: rec.id,
            data: rec.data,
            updatedAt: rec.updatedAt,
            syncedAt,
          },
        },
        { upsert: true },
      );
    }
    res.status(200).json({ pushed: body.records.length, syncedAt });
  } catch (e) {
    handleError(res, e);
  }
}
