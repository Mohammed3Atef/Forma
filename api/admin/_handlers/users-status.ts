import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser } from '../../_lib/types.js';
import { writeAudit } from '../_lib/audit.js';

/**
 * Port of `src/services/platform/accountsApi.ts`'s `setAccountStatus()`.
 * Mirrors firestore.rules: an admin's status-change branch never touches
 * role/permissions, and never applies to an admin/super_admin target; a
 * self-status-change never goes through this admin route.
 */
const Body = z.object({ status: z.enum(['active', 'suspended', 'pending', 'disabled']) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const actor = await requireUser(req);
    requireActive(actor);
    requirePermission(actor, 'users.manageStatus');

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing user id');
    if (id === actor.id) throw new HttpError(403, 'Cannot change your own status via this route');

    const body = Body.parse(req.body);
    const users = await usersCol();
    const target = await users.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found');
    if ((target.role === 'admin' || target.role === 'super_admin') && actor.role !== 'super_admin') {
      throw new HttpError(403, 'Cannot modify an admin account');
    }

    await users.updateOne({ _id: id }, { $set: { accountStatus: body.status, updatedAt: Date.now() } });
    await writeAudit(actor, 'user.updateStatus', id, { from: target.accountStatus, to: body.status });
    const updated = await users.findOne({ _id: id });
    res.status(200).json(toPublicUser(updated!));
  } catch (e) {
    handleError(res, e);
  }
}
