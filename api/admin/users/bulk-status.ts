import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth';
import { HttpError, handleError, methodGuard } from '../../_lib/http';
import { writeAudit } from '../_lib/audit';

/** Port of `src/services/platform/accountsApi.ts`'s `bulkSetAccountStatus()` — one write per target, independent (a failure never aborts the rest); returns an ok/failed tally. */
const Body = z.object({
  targetIds: z.array(z.string().trim().min(1)).min(1).max(200),
  status: z.enum(['active', 'suspended', 'pending', 'disabled']),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const actor = await requireUser(req);
    requireActive(actor);
    requirePermission(actor, 'users.manageStatus');
    const body = Body.parse(req.body);

    const users = await usersCol();
    const targets = await users.find({ _id: { $in: body.targetIds } }).toArray();
    const byId = new Map(targets.map((t) => [t._id, t]));

    const results = await Promise.allSettled(
      body.targetIds.map(async (id) => {
        const target = byId.get(id);
        if (!target) throw new HttpError(404, 'User not found');
        if (target._id === actor.id) throw new HttpError(403, 'Cannot change your own status via this route');
        if ((target.role === 'admin' || target.role === 'super_admin') && actor.role !== 'super_admin') {
          throw new HttpError(403, 'Cannot modify an admin account');
        }
        await users.updateOne({ _id: id }, { $set: { accountStatus: body.status, updatedAt: Date.now() } });
        await writeAudit(actor, 'user.updateStatus', id, { from: target.accountStatus, to: body.status });
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    res.status(200).json({ ok: results.length - failed, failed });
  } catch (e) {
    handleError(res, e);
  }
}
