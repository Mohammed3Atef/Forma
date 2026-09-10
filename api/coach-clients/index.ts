import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../_lib/withAuth';
import { hasPermission } from '../_lib/rbac';
import { HttpError, handleError, methodGuard } from '../_lib/http';
import { coachClientsCol } from './_data';
import { assignExistingClient } from './_service';

const SubscriptionStatusEnum = z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']);
const BillingCycleEnum = z.enum(['weekly', 'monthly', 'quarterly', 'custom']);

const ClientSubscriptionInputSchema = z.object({
  status: SubscriptionStatusEnum,
  months: z.number().int().positive().optional(),
  days: z.number().int().positive().optional(),
  trialDays: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().trim().max(10).optional(),
  planName: z.string().trim().max(120).optional(),
  billingCycle: BillingCycleEnum.optional(),
  startAt: z.number().optional(),
});

const AssignBody = z.object({
  clientId: z.string().trim().min(1),
  /** Only honored for an admin (`coaches.assign`) caller — a coach always assigns to themselves. */
  coachId: z.string().trim().min(1).optional(),
  subscription: ClientSubscriptionInputSchema,
});

const ListQuery = z.object({
  coachId: z.string().trim().min(1).optional(),
  clientId: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'ended', 'pending', 'all']).optional(),
});

/**
 * `GET /api/coach-clients` — list relationships.
 *  - `?coachId=` : that coach's relationships (self, or `users.read`), filtered
 *    by `status` (default `active`).
 *  - `?clientId=`: that client's full history, newest first (self, their
 *    assigned coach, or `users.read`).
 *  - neither    : "my own" list — a coach's active roster, or a client's own
 *    coaching history.
 *
 * `POST /api/coach-clients` — CASE 1: a coach (or an admin with
 * `coaches.assign`) assigns an UNASSIGNED existing client to a coach, with a
 * required subscription. Port of `assignExistingClient()` from
 * `src/services/platform/coachClientsApi.ts`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    const canReadAll = hasPermission(user.role, user.accountStatus, user.permissions, 'users.read');

    if (req.method === 'GET') {
      const q = ListQuery.parse(req.query);
      const col = await coachClientsCol();

      if (q.clientId) {
        const all = await col.find({ clientId: q.clientId }).sort({ createdAt: -1 }).toArray();
        if (user.id !== q.clientId && !canReadAll && !all.some((r) => r.coachId === user.id)) {
          throw new HttpError(403, 'Forbidden');
        }
        res.status(200).json(all);
        return;
      }

      if (q.coachId) {
        if (user.id !== q.coachId && !canReadAll) throw new HttpError(403, 'Forbidden');
        const filter: Record<string, unknown> = { coachId: q.coachId };
        if (q.status && q.status !== 'all') filter.status = q.status;
        else if (!q.status) filter.status = 'active';
        const list = await col.find(filter).sort({ createdAt: -1 }).toArray();
        res.status(200).json(list);
        return;
      }

      // No filter supplied — default to "my own" list, scoped by role.
      if (user.role === 'coach') {
        const filter: Record<string, unknown> = { coachId: user.id };
        filter.status = q.status && q.status !== 'all' ? q.status : 'active';
        const list = await col.find(filter).sort({ createdAt: -1 }).toArray();
        res.status(200).json(list);
        return;
      }
      if (user.role === 'client') {
        const list = await col.find({ clientId: user.id }).sort({ createdAt: -1 }).toArray();
        res.status(200).json(list);
        return;
      }
      throw new HttpError(400, 'coachId or clientId query parameter is required');
    }

    // POST — assign an UNASSIGNED existing client to a coach. Mutating
    // action: caller must be active.
    requireActive(user);
    const body = AssignBody.parse(req.body);
    let coachId: string;
    if (user.role === 'coach') {
      coachId = user.id;
    } else if (hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign')) {
      if (!body.coachId) throw new HttpError(400, 'coachId is required');
      coachId = body.coachId;
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    const rel = await assignExistingClient(coachId, body.clientId, user.id, body.subscription);
    res.status(201).json(rel);
  } catch (e) {
    handleError(res, e);
  }
}
