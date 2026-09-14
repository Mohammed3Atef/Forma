import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { hasPermission } from '../_lib/rbac.js';
import type { Permission, Role } from '../_lib/types.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Replaces `api/_lib/withAuth.ts`'s throw-based `requireUser()` — same check
 * (must have a resolved user), expressed as tRPC middleware instead of a
 * function every handler calls manually.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  if (ctx.user.accountStatus !== 'active') throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is not active' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Equivalent of `withAuth.ts`'s `requireRole()`, as a composable procedure builder. */
export function roleProcedure(...roles: Role[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx });
  });
}

/** Equivalent of `withAuth.ts`'s `requirePermission()`, as a composable procedure builder. */
export function permissionProcedure(perm: Permission) {
  return protectedProcedure.use(({ ctx, next }) => {
    const u = ctx.user;
    if (!hasPermission(u.role, u.accountStatus, u.permissions, perm)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx });
  });
}
