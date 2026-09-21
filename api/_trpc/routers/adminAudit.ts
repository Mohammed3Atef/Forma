import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, permissionProcedure } from '../trpc.js';
import { auditLogsCol } from '../../admin/_lib/db.js';
import { coachClientsCol, relId } from '../../coach-clients/_data.js';
import type { AuditLogDoc } from '../../admin/_lib/types.js';

/**
 * Port of `src/services/platform/auditApi.ts`. `list` reads (newest first,
 * cursor paginated); `create` appends one entry (best-effort — same shape
 * `writeAudit()` elsewhere in the app calls for every mutating admin action).
 * `adminAuditLogs` is append-only/immutable — there is no update/delete.
 *
 * `create` is reachable by any active signed-in user (not just admins)
 * because a handful of legitimate non-admin flows log their own actions this
 * way today (e.g. a coach recording `client.measurement` for one of their own
 * clients — see `src/services/platform/coachApi.ts`). Without a check here,
 * any signed-in client or coach could post an arbitrary `action` +
 * `targetUserId` and have it appear indistinguishable from a real
 * system-recorded admin event in the governance/activity views — this was
 * flagged as the one real security gap in the pre-migration REST audit
 * report. Admins are trusted as before; everyone else is restricted to the
 * known-safe action allow-list below, and only for a client they actually
 * coach.
 */
const CreateInput = z.object({
  action: z.string().trim().min(1).max(120),
  targetUserId: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Non-admin actions we know are legitimately self-logged today. Extend deliberately, not by default. */
const NON_ADMIN_ALLOWED_ACTIONS = new Set(['client.measurement']);

async function assertNonAdminWriteAllowed(user: { id: string; role: string }, body: z.infer<typeof CreateInput>): Promise<void> {
  if (!NON_ADMIN_ALLOWED_ACTIONS.has(body.action)) throw new TRPCError({ code: 'FORBIDDEN' });
  if (user.role !== 'coach') throw new TRPCError({ code: 'FORBIDDEN' });
  const coachClients = await coachClientsCol();
  const owns = await coachClients.findOne({ _id: relId(user.id, body.targetUserId) });
  if (!owns) throw new TRPCError({ code: 'FORBIDDEN' });
}

/** Escapes regex metacharacters so a user-supplied action/category string can't be interpreted as a pattern. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const adminAuditRouter = router({
  list: permissionProcedure('audit.read')
    .input(
      z
        .object({
          pageSize: z.number().optional(),
          cursor: z.string().optional(),
          /** Exact actor user id. */
          actorId: z.string().trim().min(1).optional(),
          /** Exact target user id. */
          targetUserId: z.string().trim().min(1).optional(),
          /** An exact action key (contains a '.') or a bare category prefix (e.g. "users" matches "users.*"). */
          action: z.string().trim().min(1).max(120).optional(),
          since: z.number().int().nonnegative().optional(),
          until: z.number().int().nonnegative().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const col = await auditLogsCol();
      const pageSize = Math.min(Math.max(input?.pageSize || 25, 1), 100);
      // Every filter is a server-side query condition (not client-side over
      // whatever pages happen to be loaded), combined with `$and` so the
      // cursor's own `$or` boundary never clobbers the other filters.
      const conditions: Record<string, unknown>[] = [];
      if (input?.actorId) conditions.push({ actorId: input.actorId });
      if (input?.targetUserId) conditions.push({ targetUserId: input.targetUserId });
      if (input?.action) {
        conditions.push(
          input.action.includes('.') ? { action: input.action } : { action: { $regex: `^${escapeRegex(input.action)}\\.` } },
        );
      }
      if (input?.since != null) conditions.push({ createdAt: { $gte: input.since } });
      if (input?.until != null) conditions.push({ createdAt: { $lte: input.until } });
      if (input?.cursor) {
        const [ts, id] = input.cursor.split(':');
        const tsNum = Number(ts);
        if (Number.isFinite(tsNum) && id) {
          conditions.push({ $or: [{ createdAt: { $lt: tsNum } }, { createdAt: tsNum, _id: { $lt: id } }] });
        }
      }
      const filter: Record<string, unknown> = conditions.length ? { $and: conditions } : {};
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
      return { logs, cursor: nextCursor };
    }),

  create: protectedProcedure.input(CreateInput).mutation(async ({ ctx, input }) => {
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin') {
      await assertNonAdminWriteAllowed(ctx.user, input);
    }
    const col = await auditLogsCol();
    const doc: AuditLogDoc = {
      _id: crypto.randomUUID(),
      actorId: ctx.user.id,
      actorRole: ctx.user.role,
      action: input.action,
      targetUserId: input.targetUserId,
      metadata: input.metadata ?? {},
      createdAt: Date.now(),
    };
    await col.insertOne(doc);
    return { id: doc._id, ...doc };
  }),
});
