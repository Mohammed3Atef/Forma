import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActive, requireUser } from '../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { flagsCol, toPublicFlag } from './_lib.js';

/** Single-flag read, complementing `listFlags()` (api/flags/index.ts). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing flag id');

    const col = await flagsCol();
    const doc = await col.findOne({ _id: id });
    if (!doc) throw new HttpError(404, 'Flag not found');
    res.status(200).json(toPublicFlag(doc));
  } catch (e) {
    handleError(res, e);
  }
}
