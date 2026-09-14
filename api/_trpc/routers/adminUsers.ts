import crypto from 'node:crypto';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, permissionProcedure, roleProcedure } from '../trpc.js';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { ALL_PERMISSIONS } from '../../_lib/rbac.js';
import { toPublicUser, type Permission, type Role, type UserDoc } from '../../_lib/types.js';
import { writeAudit } from '../../admin/_lib/audit.js';

const RoleEnum = z.enum(['super_admin', 'admin', 'coach', 'client']);
const StatusEnum = z.enum(['active', 'suspended', 'pending', 'disabled']);

/**
 * Port of `src/services/platform/accountsApi.ts` + the 8 `api/admin/_handlers/
 * users-*.ts` REST handlers. Everything here keeps the exact same
 * authorization semantics as before (see each procedure's guard), with ONE
 * deliberate fix: `get` (fetch one user's public profile by id) no longer
 * requires `users.read`.
 *
 * That permission gate made sense for the admin-only bulk views (`list`,
 * `byRole`, `searchClients`) but `get` is also the ONLY route behind
 * `fetchUser()` in `accountsApi.ts`, which is called from plain client-facing
 * UI that has nothing to do with admin oversight — a client's "Your Coach"
 * card (`CoachInfoCard.tsx`), the notification bell, the Messages page, all
 * via `clientCoachApi.ts`'s `fetchMyCoach()`. A plain `client` role carries
 * NO permissions at all (see `rbac.ts`), so under the old REST handler this
 * route unconditionally 403'd for every client — masked in production only
 * because the same route also always 404'd first, from the Vercel catch-all
 * routing bug this whole migration exists to fix (see the migration plan's
 * Phase 0 findings: `/api/admin/users/:id` is a 2-segment path, always
 * dropped at Vercel's edge). Fixing the transport bug without relaxing this
 * gate would have turned a silent 404 into a very real, very live 403 for
 * every client's coach card. `get` only ever returns `toPublicUser()`'s
 * already-secret-stripped fields, and requires already knowing the target's
 * (random, non-enumerable) id — the same trust model every other
 * counterparty-profile read in this app already uses (message threads,
 * assigned-coach reads, etc.), so opening it to any authenticated active user
 * doesn't introduce a new exposure.
 */
export const adminUsersRouter = router({
  list: permissionProcedure('users.read')
    .input(z.object({ pageSize: z.number().optional(), cursor: z.string().optional(), role: RoleEnum.optional(), status: StatusEnum.optional() }).optional())
    .query(async ({ input }) => {
      const users = await usersCol();
      const pageSize = Math.min(Math.max(input?.pageSize || 25, 1), 100);
      const filter: Record<string, unknown> = {};
      if (input?.role) filter.role = input.role;
      if (input?.status) filter.accountStatus = input.status;
      if (input?.cursor) {
        const [ts, id] = input.cursor.split(':');
        const tsNum = Number(ts);
        if (Number.isFinite(tsNum) && id) {
          filter.$or = [{ createdAt: { $lt: tsNum } }, { createdAt: tsNum, _id: { $lt: id } }];
        }
      }
      const docs = await users.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize).toArray();
      const nextCursor = docs.length === pageSize ? `${docs[docs.length - 1].createdAt}:${docs[docs.length - 1]._id}` : null;
      return { users: docs.map(toPublicUser), cursor: nextCursor };
    }),

  create: permissionProcedure('users.create')
    .input(
      z.object({
        email: z.string().trim().toLowerCase().email(),
        password: z.string().min(8).max(200),
        displayName: z.string().trim().min(1).max(120),
        phone: z.string().trim().max(40).optional(),
        role: RoleEnum,
        accountStatus: StatusEnum.optional(),
        permissions: z.array(z.string()).optional(),
        assignedCoachId: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const users = await usersCol();
      // Admin/super_admin accounts are never provisioned through the general
      // "create any user" procedure — only a super_admin may even attempt it
      // here, mirroring firestore.rules' isSuperAdmin() vs. users.create+client/coach split.
      if (input.role === 'admin' || input.role === 'super_admin') {
        if (ctx.user.role !== 'super_admin') throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (await users.findOne({ emailLower: input.email })) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists.' });
      }
      const now = Date.now();
      const doc: UserDoc = {
        _id: crypto.randomUUID(),
        email: input.email,
        emailLower: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        displayNameLower: input.displayName.toLowerCase(),
        phone: input.phone,
        role: input.role,
        accountStatus: input.accountStatus ?? 'active',
        permissions: (input.permissions ?? []) as Permission[],
        featureFlags: {},
        createdBy: ctx.user.id,
        assignedCoachId: input.assignedCoachId,
        mustChangePassword: true,
        createdAt: now,
        updatedAt: now,
      };
      await users.insertOne(doc);
      await writeAudit(ctx.user, 'user.create', doc._id, { role: doc.role });
      return toPublicUser(doc);
    }),

  byRole: permissionProcedure('users.read')
    .input(z.object({ role: RoleEnum, max: z.number().optional() }))
    .query(async ({ input }) => {
      const max = Math.min(Math.max(input.max || 200, 1), 500);
      const users = await usersCol();
      const docs = await users.find({ role: input.role }).limit(max).toArray();
      return docs.map(toPublicUser);
    }),

  searchClients: permissionProcedure('users.read')
    .input(z.object({ value: z.string(), max: z.number().optional() }))
    .query(async ({ input }) => {
      const raw = input.value.trim();
      const max = Math.min(Math.max(input.max || 20, 1), 100);
      if (!raw) return [];
      const lower = raw.toLowerCase();
      const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orConds: Record<string, unknown>[] = [{ email: raw }, { phone: raw }, { displayNameLower: { $regex: `^${escapeRegExp(lower)}` } }];
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
      return out.slice(0, max);
    }),

  bulkSetStatus: permissionProcedure('users.manageStatus')
    .input(z.object({ targetIds: z.array(z.string().trim().min(1)).min(1).max(200), status: StatusEnum }))
    .mutation(async ({ ctx, input }) => {
      const users = await usersCol();
      const targets = await users.find({ _id: { $in: input.targetIds } }).toArray();
      const byId = new Map(targets.map((t) => [t._id, t]));

      const results = await Promise.allSettled(
        input.targetIds.map(async (id) => {
          const target = byId.get(id);
          if (!target) throw new TRPCError({ code: 'NOT_FOUND' });
          if (target._id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own status via this route' });
          if ((target.role === 'admin' || target.role === 'super_admin') && ctx.user.role !== 'super_admin') {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify an admin account' });
          }
          await users.updateOne({ _id: id }, { $set: { accountStatus: input.status, updatedAt: Date.now() } });
          await writeAudit(ctx.user, 'user.updateStatus', id, { from: target.accountStatus, to: input.status });
        }),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      return { ok: results.length - failed, failed };
    }),

  /** See the module doc comment above — deliberately NOT permission-gated. */
  get: protectedProcedure.input(z.object({ id: z.string().trim().min(1) })).query(async ({ input }) => {
    const users = await usersCol();
    const target = await users.findOne({ _id: input.id });
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    return toPublicUser(target);
  }),

  /** Hard delete — super_admin only, per firestore.rules' `allow delete: if isSuperAdmin()`. Prefer `setStatus('disabled')` for reversible deactivation. */
  delete: roleProcedure('super_admin').input(z.object({ id: z.string().trim().min(1) })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot delete your own account' });
    const users = await usersCol();
    const target = await users.findOne({ _id: input.id });
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    await users.deleteOne({ _id: input.id });
    await writeAudit(ctx.user, 'user.delete', input.id, { role: target.role, email: target.email });
  }),

  setStatus: permissionProcedure('users.manageStatus')
    .input(z.object({ id: z.string().trim().min(1), status: StatusEnum }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own status via this route' });
      const users = await usersCol();
      const target = await users.findOne({ _id: input.id });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if ((target.role === 'admin' || target.role === 'super_admin') && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify an admin account' });
      }
      await users.updateOne({ _id: input.id }, { $set: { accountStatus: input.status, updatedAt: Date.now() } });
      await writeAudit(ctx.user, 'user.updateStatus', input.id, { from: target.accountStatus, to: input.status });
      const updated = await users.findOne({ _id: input.id });
      return toPublicUser(updated!);
    }),

  setRole: permissionProcedure('users.manageRoles')
    .input(z.object({ id: z.string().trim().min(1), role: z.enum(['client', 'coach']) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own role' });
      const users = await usersCol();
      const target = await users.findOne({ _id: input.id });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if ((target.role === 'admin' || target.role === 'super_admin') && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify an admin account' });
      }
      await users.updateOne({ _id: input.id }, { $set: { role: input.role as Role, updatedAt: Date.now() } });
      await writeAudit(ctx.user, 'user.updateRole', input.id, { from: target.role, to: input.role });
      const updated = await users.findOne({ _id: input.id });
      return toPublicUser(updated!);
    }),

  setPermissions: permissionProcedure('users.manageRoles')
    .input(z.object({ id: z.string().trim().min(1), permissions: z.array(z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]])) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own permissions' });
      const users = await usersCol();
      const target = await users.findOne({ _id: input.id });
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      if ((target.role === 'admin' || target.role === 'super_admin') && ctx.user.role !== 'super_admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot modify an admin account' });
      }
      await users.updateOne({ _id: input.id }, { $set: { permissions: input.permissions, updatedAt: Date.now() } });
      await writeAudit(ctx.user, 'user.updatePermissions', input.id, { permissions: input.permissions });
      const updated = await users.findOne({ _id: input.id });
      return toPublicUser(updated!);
    }),
});
