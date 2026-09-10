import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireActive, requirePermission, requireUser } from '../../_lib/withAuth.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { auditLogsCol } from '../_lib/db.js';
import { coachClientsCol, relId } from '../../coach-clients/_data.js';
import type { AuditLogDoc } from '../_lib/types.js';

/**
 * Port of `src/services/platform/auditApi.ts`. GET lists (newest first, cursor
 * paginated); POST appends one entry (best-effort — same shape `writeAudit()`
 * elsewhere in the app will eventually call for every mutating admin action).
 * `adminAuditLogs` is append-only/immutable — there is no update/delete route.
 *
 * POST is reachable by any active signed-in user (not just admins) because a
 * handful of legitimate non-admin flows log their own actions this way today
 * (e.g. a coach recording `client.measurement` for one of their own clients —
 * see `src/services/platform/coachApi.ts`). Everything else that calls
 * `writeAudit()` from the frontend is admin/super-admin-only. Without a check
 * here, any signed-in client or coach could POST an arbitrary `action` +
 * `targetUserId` and have it appear indistinguishable from a real
 * system-recorded admin event in the governance/activity views. Admins are
 * trusted as before; everyone else is restricted to the known-safe action
 * allow-list below, and only for a client they actually coach.
 */
const CreateBody = z.object({
  action: z.string().trim().min(1).max(120),
  targetUserId: z.string().trim().min(1),
  metadata: z.record(z.unknown()).optional(),
});

/** Non-admin actions we know are legitimately self-logged today. Extend deliberately, not by default. */
const NON_ADMIN_ALLOWED_ACTIONS = new Set(['client.measurement']);

async function assertNonAdminWriteAllowed(user: { id: string; role: string }, body: { action: string; targetUserId: string }): Promise<void> {
  if (!NON_ADMIN_ALLOWED_ACTIONS.has(body.action)) throw new HttpError(403, 'Forbidden');
  if (user.role !== 'coach') throw new HttpError(403, 'Forbidden');
  const coachClients = await coachClientsCol();
  const owns = await coachClients.findOne({ _id: relId(user.id, body.targetUserId) });
  if (!owns) throw new HttpError(403, 'Forbidden');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'GET', 'POST');
    const user = await requireUser(req);
    requireActive(user);
    const col = await auditLogsCol();

    if (req.method === 'POST') {
      const body = CreateBody.parse(req.body);
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        await assertNonAdminWriteAllowed(user, body);
      }
      const doc: AuditLogDoc = {
        _id: crypto.randomUUID(),
        actorId: user.id,
        actorRole: user.role,
        action: body.action,
        targetUserId: body.targetUserId,
        metadata: body.metadata ?? {},
        createdAt: Date.now(),
      };
      await col.insertOne(doc);
      res.status(201).json({ id: doc._id, ...doc });
      return;
    }

    requirePermission(user, 'audit.read');
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 100);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const filter: Record<string, unknown> = {};
    if (cursor) {
      const [ts, id] = cursor.split(':');
      const tsNum = Number(ts);
      if (Number.isFinite(tsNum) && id) {
        filter.$or = [{ createdAt: { $lt: tsNum } }, { createdAt: tsNum, _id: { $lt: id } }];
      }
    }
    const docs = await col.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize).toArray();
    const logs = docs.map((d) => ({
      id: d._id,
      actorId: d.actorId,
      actorRole: d.actorRole,
      action: d.action,
      targetUserId: d.targetUserId,
      metadata: d.metadata,
      createdAt: d.createdAt,
    }));
    const nextCursor = docs.length === pageSize ? `${docs[docs.length - 1].createdAt}:${docs[docs.length - 1]._id}` : null;
    res.status(200).json({ logs, cursor: nextCursor });
  } catch (e) {
    handleError(res, e);
  }
}
