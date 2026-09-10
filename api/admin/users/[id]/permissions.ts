import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../../_lib/mongodb';
import { ALL_PERMISSIONS } from '../../../_lib/rbac';
import { requireActive, requirePermission, requireUser } from '../../../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../../../_lib/http';
import { toPublicUser, type Permission } from '../../../_lib/types';
import { writeAudit } from '../../_lib/audit';

/** Port of `src/services/platform/accountsApi.ts`'s `setPermissions()`. */
const Body = z.object({
  permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const actor = await requireUser(req);
    requireActive(actor);
    requirePermission(actor, 'users.manageRoles');

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing user id');
    if (id === actor.id) throw new HttpError(403, 'Cannot change your own permissions');

    const body = Body.parse(req.body);
    const users = await usersCol();
    const target = await users.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found');
    if ((target.role === 'admin' || target.role === 'super_admin') && actor.role !== 'super_admin') {
      throw new HttpError(403, 'Cannot modify an admin account');
    }

    await users.updateOne({ _id: id }, { $set: { permissions: body.permissions, updatedAt: Date.now() } });
    await writeAudit(actor, 'user.updatePermissions', id, { permissions: body.permissions });
    const updated = await users.findOne({ _id: id });
    res.status(200).json(toPublicUser(updated!));
  } catch (e) {
    handleError(res, e);
  }
}
