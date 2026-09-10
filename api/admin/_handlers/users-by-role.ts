import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser, type Role } from '../../_lib/types.js';

const VALID_ROLES: Role[] = ['super_admin', 'admin', 'coach', 'client'];

/** Port of `src/services/platform/accountsApi.ts`'s `fetchByRole()` (for pickers; capped). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const role = typeof req.query.role === 'string' ? req.query.role : '';
    if (!VALID_ROLES.includes(role as Role)) throw new HttpError(400, 'Invalid or missing role');
    const max = Math.min(Math.max(Number(req.query.max) || 200, 1), 500);

    const users = await usersCol();
    const docs = await users.find({ role: role as Role }).limit(max).toArray();
    res.status(200).json(docs.map(toPublicUser));
  } catch (e) {
    handleError(res, e);
  }
}
