import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { singletonId, syncSingletonsCol } from './_data.js';

const Query = z.object({ name: z.enum(['profile', 'settings']) });
const PutBody = z.object({ name: z.enum(['profile', 'settings']), data: z.record(z.string(), z.unknown()), updatedAt: z.number() });

/** GET the caller's own profile/settings singleton; PUT last-write-wins by updatedAt. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PUT');
    const user = await requireUser(req);
    const col = await syncSingletonsCol();
    if (req.method === 'GET') {
      const q = Query.parse(req.query);
      const doc = await col.findOne({ _id: singletonId(user.id, q.name) });
      res.status(200).json(doc ? { data: doc.data, updatedAt: doc.updatedAt } : null);
      return;
    }
    const body = PutBody.parse(req.body);
    const existing = await col.findOne({ _id: singletonId(user.id, body.name) });
    if (existing && existing.updatedAt > body.updatedAt) {
      // Remote is newer — reject the stale write, client should pull instead.
      res.status(200).json({ data: existing.data, updatedAt: existing.updatedAt, stale: true });
      return;
    }
    await col.updateOne(
      { _id: singletonId(user.id, body.name) },
      { $set: { clientId: user.id, name: body.name, data: body.data, updatedAt: body.updatedAt } },
      { upsert: true },
    );
    res.status(200).json({ data: body.data, updatedAt: body.updatedAt, stale: false });
  } catch (e) {
    handleError(res, e);
  }
}
