import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../../_lib/mongodb.js';
import { requireActive, requirePermission, requireUser } from '../../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../../_lib/http.js';
import { toPublicUser } from '../../../_lib/types.js';
import { writeAudit } from '../../_lib/audit.js';

/**
 * Port of `src/services/platform/accountsApi.ts`'s `setRole()`. Per
 * firestore.rules' `hasPermission('users.manageRoles')` branch, the new role
 * is limited to client/coach (admin/super_admin are never assigned through
 * this route — an admin can never touch another admin/super_admin's role,
 * and this route also blocks changing your OWN role, which the rules already
 * do for any self-write).
 */
const Body = z.object({ role: z.enum(['client', 'coach']) });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'PATCH');
    const actor = await requireUser(req);
    requireActive(actor);
    requirePermission(actor, 'users.manageRoles');

    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!id) throw new HttpError(400, 'Missing user id');
    if (id === actor.id) throw new HttpError(403, 'Cannot change your own role');

    const body = Body.parse(req.body);
    const users = await usersCol();
    const target = await users.findOne({ _id: id });
    if (!target) throw new HttpError(404, 'User not found');
    if ((target.role === 'admin' || target.role === 'super_admin') && actor.role !== 'super_admin') {
      throw new HttpError(403, 'Cannot modify an admin account');
    }

    await users.updateOne({ _id: id }, { $set: { role: body.role, updatedAt: Date.now() } });
    await writeAudit(actor, 'user.updateRole', id, { from: target.role, to: body.role });
    const updated = await users.findOne({ _id: id });
    res.status(200).json(toPublicUser(updated!));
  } catch (e) {
    handleError(res, e);
  }
}
