import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../_lib/withAuth';
import { handleError, methodGuard } from '../_lib/http';
import { dayKey, usageStatsCol } from './_lib';

/** Port of `usageApi.ts`'s `bumpUsage('searches')` — increments today's platform usage counter (best-effort telemetry). */
const Body = z.object({ field: z.literal('searches') });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    requireActive(user);
    Body.parse(req.body ?? {});

    const day = dayKey();
    const col = await usageStatsCol();
    await col.updateOne(
      { _id: day },
      { $set: { day, updatedAt: Date.now() }, $inc: { searches: 1 } },
      { upsert: true },
    );
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
