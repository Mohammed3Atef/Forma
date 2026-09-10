import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requireUser } from '../_lib/withAuth.js';
import { hasPermission } from '../_lib/rbac.js';
import { HttpError, handleError, methodGuard } from '../_lib/http.js';
import { usersCol } from '../_lib/mongodb.js';
import { DEFAULT_TTL_MS, generateInviteCode, invitesCol } from './_data.js';
import type { SignupInviteDoc } from './_types.js';

const SubscriptionStatusEnum = z.enum(['trial', 'active', 'pending', 'expired', 'cancelled', 'frozen', 'ended']);
const BillingCycleEnum = z.enum(['weekly', 'monthly', 'quarterly', 'custom']);

const CreateBody = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  subStatus: SubscriptionStatusEnum.optional(),
  subPlanName: z.string().trim().max(120).optional(),
  subPrice: z.number().nonnegative().optional(),
  subCurrency: z.string().trim().max(10).optional(),
  subBillingCycle: BillingCycleEnum.optional(),
  subMonths: z.number().int().positive().optional(),
  subDays: z.number().int().positive().optional(),
  subTrialDays: z.number().int().positive().optional(),
  /** Override the default 14-day TTL; pass `null` for a non-expiring invite. */
  ttlMs: z.number().int().positive().nullable().optional(),
  /** Only honored for an admin (`coaches.assign`) caller — a coach always creates their own invites. */
  coachId: z.string().trim().min(1).optional(),
});

const ListQuery = z.object({
  status: z.enum(['pending', 'claimed', 'revoked', 'all']).optional(),
  /** Only honored for an admin (`coaches.assign`) caller — a coach always lists their own. */
  coachId: z.string().trim().min(1).optional(),
});

/**
 * `GET /api/invites` — the requesting coach's own invites, newest first (an
 * admin with `coaches.assign` may pass `?coachId=` to inspect another coach's
 * invites for oversight). Defaults to `status=pending` (and, like
 * `listPendingInvites()`, additionally drops expired ones) same as the
 * Firestore-era list. Pass `?status=all` for the full history (used by a
 * "past invites" screen).
 *
 * `POST /api/invites` — coach generates a new pending invite (with the
 * client's billing/subscription settings applied on claim). Port of
 * `createInvite()`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    const col = await invitesCol();

    if (req.method === 'GET') {
      const q = ListQuery.parse(req.query);
      const canAssign = hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign');
      if (user.role !== 'coach' && !canAssign) throw new HttpError(403, 'Forbidden');
      if (q.coachId && q.coachId !== user.id && !canAssign) throw new HttpError(403, 'Forbidden');
      const coachId = q.coachId && canAssign ? q.coachId : user.id;
      const status = q.status ?? 'pending';
      const filter: Record<string, unknown> = { coachId };
      if (status !== 'all') filter.status = status;
      const docs = await col.find(filter).sort({ createdAt: -1 }).toArray();
      const now = Date.now();
      const list = status === 'pending' ? docs.filter((i) => i.expiresAt == null || i.expiresAt > now) : docs;
      res.status(200).json(list);
      return;
    }

    // POST — create. Mutating action: the caller must be an ACTIVE coach (or
    // active admin) — mirrors `isCoach()`/`isActive()` in `firestore.rules`.
    requireActive(user);
    const body = CreateBody.parse(req.body);
    let coachId: string;
    if (user.role === 'coach') {
      coachId = user.id;
    } else if (hasPermission(user.role, user.accountStatus, user.permissions, 'coaches.assign')) {
      if (!body.coachId) throw new HttpError(400, 'coachId is required');
      coachId = body.coachId;
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    // Denormalise the coach's display name onto the invite for the pre-auth
    // claim screen (mirrors `input.coachName` in `createInvite()`, resolved
    // from the coach doc since the frontend no longer supplies it directly).
    const users = await usersCol();
    const coach = await users.findOne({ _id: coachId });
    if (!coach) throw new HttpError(404, 'Coach not found');

    const now = Date.now();
    const ttl = body.ttlMs === undefined ? DEFAULT_TTL_MS : body.ttlMs;

    let created: SignupInviteDoc | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const code = generateInviteCode();
      const invite: SignupInviteDoc = {
        _id: code,
        coachId,
        status: 'pending',
        claimedByUid: null,
        createdAt: now,
        claimedAt: null,
        expiresAt: ttl === null ? null : now + ttl,
        ...(coach.displayName ? { coachName: coach.displayName } : {}),
        ...(body.email ? { email: body.email } : {}),
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
        subStatus: body.subStatus ?? 'trial',
        ...(body.subPlanName ? { subPlanName: body.subPlanName } : {}),
        ...(body.subPrice != null ? { subPrice: body.subPrice } : {}),
        ...(body.subCurrency ? { subCurrency: body.subCurrency } : {}),
        ...(body.subBillingCycle ? { subBillingCycle: body.subBillingCycle } : {}),
        ...(body.subMonths != null ? { subMonths: body.subMonths } : {}),
        ...(body.subDays != null ? { subDays: body.subDays } : {}),
        ...(body.subTrialDays != null ? { subTrialDays: body.subTrialDays } : {}),
      };
      try {
        await col.insertOne(invite);
        created = invite;
      } catch (e) {
        // Duplicate key on the (vanishingly unlikely) code collision — retry.
        if (!(e instanceof Error) || !('code' in e) || (e as { code?: number }).code !== 11000) throw e;
      }
    }
    if (!created) throw new HttpError(500, 'Could not allocate a unique invite code');
    res.status(201).json(created);
  } catch (e) {
    handleError(res, e);
  }
}
