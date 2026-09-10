import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../../_lib/withAuth.js';
import { hasPermission } from '../../_lib/rbac.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { coachClientsCol } from '../_data.js';
import { endRelationship, transferClientWithMode, updateSubscription, type SubscriptionAction } from '../_service.js';
import type { ClientSubscriptionInput } from '../_types.js';

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

const EndBody = z.object({
  action: z.literal('end'),
  reason: z.enum(['released', 'unassigned']).optional(),
});

const TransferBody = z.object({
  action: z.literal('transfer'),
  toCoachId: z.string().trim().min(1),
  mode: z.enum(['fresh_start', 'keep_plans']),
  subscriptionHandling: z.enum(['keep', 'new', 'expire']),
  newSubscription: ClientSubscriptionInputSchema.optional(),
});

const SubscriptionActionSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('setTerm'), startAt: z.number(), months: z.number().int().positive().optional(), days: z.number().int().positive().optional(), price: z.number().nonnegative().optional(), currency: z.string().trim().max(10).optional(), planName: z.string().trim().max(120).optional() }),
  z.object({ op: z.literal('setPrice'), price: z.number().nonnegative(), currency: z.string().trim().max(10).optional() }),
  z.object({ op: z.literal('freeze'), from: z.number(), until: z.number(), note: z.string().trim().max(500).optional() }),
  z.object({ op: z.literal('unfreeze') }),
  z.object({ op: z.literal('end') }),
  z.object({ op: z.literal('cancel') }),
  z.object({ op: z.literal('extend'), days: z.number().int().positive() }),
]);

const SubscriptionBody = z.object({ action: z.literal('subscription'), sub: SubscriptionActionSchema });

const PatchBody = z.discriminatedUnion('action', [EndBody, TransferBody, SubscriptionBody]);

function parseId(raw: unknown): { coachId: string; clientId: string } {
  const id = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  const sep = id.indexOf('__');
  if (sep <= 0 || sep === id.length - 2) throw new HttpError(400, 'Malformed relationship id');
  return { coachId: id.slice(0, sep), clientId: id.slice(sep + 2) };
}

/**
 * `GET /api/coach-clients/:id` — fetch one relationship (`:id` ==
 * `${coachId}__${clientId}`).
 *
 * `PATCH /api/coach-clients/:id` — CRUD "end" and "reassign":
 *  - `{ action: 'end' }`      : the owning coach releases their own client, or
 *    an admin (`coaches.assign`) unassigns one. Port of `releaseClient()` /
 *    `unassignClient()`.
 *  - `{ action: 'transfer' }` : an admin (`coaches.assign`; `clients.writeAll`
 *    additionally required for `mode: 'fresh_start'`) reassigns the client to
 *    a new coach directly. Port of `transferClientWithMode()`, which for
 *    `mode: 'fresh_start'` also archives + clears the previous coach's
 *    plan/notes/targets content (see that function's doc comment).
 *  - `{ action: 'subscription', sub }` : the owning coach (or an admin with
 *    `clients.writeAll`) mutates an EXISTING relationship's subscription in
 *    place — set term/price, freeze/unfreeze, end, cancel, extend. Port of
 *    `setSubscriptionTerm`/`setSubscriptionPrice`/`freezeSubscription`/
 *    `unfreezeSubscription`/`endSubscription`/`cancelSubscription`/
 *    `extendSubscription` via `updateSubscription()`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'PATCH');
    const user = await requireUser(req);
    const { coachId, clientId } = parseId(req.query.id);
    const canAssign = hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign');

    if (req.method === 'GET') {
      const col = await coachClientsCol();
      const doc = await col.findOne({ _id: `${coachId}__${clientId}` });
      if (!doc) throw new HttpError(404, 'Relationship not found');
      const canReadAll = hasPermission(user.role, user.accountStatus, user.permissions, 'users.read');
      if (user.id !== doc.coachId && user.id !== doc.clientId && !canReadAll) throw new HttpError(403, 'Forbidden');
      res.status(200).json(doc);
      return;
    }

    // Mutating action: caller must be active.
    requireActive(user);
    const body = PatchBody.parse(req.body);

    if (body.action === 'end') {
      const isOwningCoach = user.role === 'coach' && coachId === user.id;
      if (!isOwningCoach && !canAssign) throw new HttpError(403, 'Forbidden');
      const endReason = body.reason ?? (isOwningCoach ? 'released' : 'unassigned');
      const updated = await endRelationship(coachId, clientId, user.id, endReason);
      res.status(200).json(updated);
      return;
    }

    if (body.action === 'subscription') {
      const isOwningCoach = user.role === 'coach' && coachId === user.id;
      const canWriteAll = hasPermission(user.role, user.accountStatus, user.permissions, 'clients.writeAll');
      if (!isOwningCoach && !canWriteAll) throw new HttpError(403, 'Forbidden');
      const updated = await updateSubscription(coachId, clientId, body.sub as SubscriptionAction);
      res.status(200).json(updated);
      return;
    }

    // 'transfer' — admin-only reassignment (never a plain coach; a coach must
    // go through the transfer-REQUEST flow in api/transfers instead).
    if (!canAssign) throw new HttpError(403, 'Forbidden');
    if (body.mode === 'fresh_start' && !hasPermission(user.role, user.accountStatus, user.permissions, 'clients.writeAll')) {
      throw new HttpError(403, 'Only a super admin may perform a fresh-start transfer');
    }
    const updated = await transferClientWithMode(
      clientId,
      coachId,
      body.toCoachId,
      body.mode,
      body.subscriptionHandling,
      user.id,
      body.newSubscription as ClientSubscriptionInput | undefined,
    );
    res.status(200).json(updated);
  } catch (e) {
    handleError(res, e);
  }
}
