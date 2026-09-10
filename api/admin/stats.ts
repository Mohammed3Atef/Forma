import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../_lib/mongodb';
import { requireActive, requirePermission, requireUser } from '../_lib/withAuth';
import { handleError, methodGuard } from '../_lib/http';
import type { Role } from '../_lib/types';

/** Port of `src/services/platform/analyticsApi.ts`'s `fetchPlatformStats()`. */
export interface PlatformStats {
  total: number;
  byRole: Record<Role, number>;
  pending: number;
  suspended: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const users = await usersCol();
    const [total, superAdmin, admin, coach, client, pending, suspended] = await Promise.all([
      users.countDocuments({}),
      users.countDocuments({ role: 'super_admin' }),
      users.countDocuments({ role: 'admin' }),
      users.countDocuments({ role: 'coach' }),
      users.countDocuments({ role: 'client' }),
      users.countDocuments({ accountStatus: 'pending' }),
      users.countDocuments({ accountStatus: 'suspended' }),
    ]);

    const stats: PlatformStats = {
      total,
      byRole: { super_admin: superAdmin, admin, coach, client },
      pending,
      suspended,
    };
    res.status(200).json(stats);
  } catch (e) {
    handleError(res, e);
  }
}
