import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../../_lib/mongodb';
import { requireActive, requirePermission, requireRole, requireUser } from '../../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../../_lib/http';
import { toPublicUser } from '../../_lib/types';
import { writeAudit } from '../_lib/audit';

/**
 * Port of `src/services/platform/accountsApi.ts`'s `fetchUser()` (GET) and
 * `deleteUser()` (DELETE — super_admin only, per firestore.rules `allow delete:
 * if isSuperAdmin()`; prefer `accountStatus: 'disabled'` for reversible
 * deactivation, this is a hard delete).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'DELETE');
    const actor = await requireUser(req);
    requireActive(actor);
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing user id');
    const users = await usersCol();

    if (req.method === 'DELETE') {
      requireRole(actor, 'super_admin');
      if (id === actor.id) throw new HttpError(403, 'Cannot delete your own account');
      const target = await users.findOne({ _id: id });
      if (!target) throw new HttpError(404, 'User not found');
      await users.deleteOne({ _id: id });
      await writeAudit(actor, 'user.delete', id, { role: target.role, email: target.email });
      res.status(204).end();
      return;
    }

    requirePermission(actor, 'users.read');
    const target = await users.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found');
    res.status(200).json(toPublicUser(target));
  } catch (e) {
    handleError(res, e);
  }
}
