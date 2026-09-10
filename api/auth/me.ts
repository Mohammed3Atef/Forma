import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireUser } from '../_lib/withAuth.js';
import { handleError, methodGuard } from '../_lib/http.js';
import { toPublicUser } from '../_lib/types.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    res.status(200).json(toPublicUser(user.doc));
  } catch (e) {
    handleError(res, e);
  }
}
