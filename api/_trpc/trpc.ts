import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { hasPermission } from '../_lib/rbac.js';
import type { Permission, Role } from '../_lib/types.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Replaces `api/_lib/withAuth.ts`'s bare, throw-based `requireUser()` — same
 * check (must have a resolved user), no account-status requirement. Almost
 * every module wants `protectedProcedure` below instead (which additionally
 * requires `accountStatus === 'active'`, mirroring those same modules'
 * `requireActive()` call); this bare variant exists for the handful of old
 * REST handlers that deliberately called ONLY `requireUser()` — e.g.
 * `api/sync/_handlers/*.ts`, so a pending/suspended account's offline queue
 * can still flush and its own data can still be read.
 */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Replaces `api/_lib/withAuth.ts`'s throw-based `requireUser()` + `requireActive()`
 * pair, expressed as tRPC middleware instead of functions every handler calls
 * manually.
 */
export const protectedProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.accountStatus !== 'active') throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is not active' });
  return next({ ctx });
});

/** Equivalent of `withAuth.ts`'s `requireRole()` PLUS `requireActive()`, as a composable procedure builder. */
export function roleProcedure(...roles: Role[]) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN' });
    return next({ ctx });
  });
}

/**
 * Equivalent of `withAuth.ts`'s `requireRole()` alone — deliberately NOT
 * paired with an active-status requirement. Only for the couple of old REST
 * handlers that called `requireRole()` without ALSO calling `requireActive()`
 * (`api/coach-plans/_handlers/me.ts` and `trial.ts` — both bare
 * `requireUser()` + `requireRole(user, 'coach')`, no active check). Prefer
 * `roleProcedure` for everything else.
 */
export function roleProcedureNoActive(...roles: Role[]) {
  return authedProcedure.use(({ ctx, next }) => {
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
