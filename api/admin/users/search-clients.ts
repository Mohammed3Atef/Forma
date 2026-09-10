import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../../_lib/mongodb';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth';
import { handleError, methodGuard } from '../../_lib/http';
import { toPublicUser } from '../../_lib/types';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Port of `src/services/platform/accountsApi.ts`'s `searchClients()` — find
 * existing CLIENT accounts by exact email, exact phone, or name prefix
 * (case-insensitive via `displayNameLower`), for "Add Existing Client".
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET');
    const user = await requireUser(req);
    requireActive(user);
    requirePermission(user, 'users.read');

    const raw = typeof req.query.value === 'string' ? req.query.value.trim() : '';
    const max = Math.min(Math.max(Number(req.query.max) || 20, 1), 100);
    if (!raw) {
      res.status(200).json([]);
      return;
    }
    const lower = raw.toLowerCase();

    const orConds: Record<string, unknown>[] = [
      { email: raw },
      { phone: raw },
      { displayNameLower: { $regex: `^${escapeRegExp(lower)}` } },
    ];
    if (lower !== raw) orConds.unshift({ email: lower });

    const users = await usersCol();
    const docs = await users.find({ role: 'client', $or: orConds }).limit(max).toArray();

    const seen = new Set<string>();
    const out = [];
    for (const d of docs) {
      if (seen.has(d._id)) continue;
      seen.add(d._id);
      out.push(toPublicUser(d));
    }
    res.status(200).json(out.slice(0, max));
  } catch (e) {
    handleError(res, e);
  }
}
