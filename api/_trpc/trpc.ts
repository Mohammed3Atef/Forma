import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { hasPermission } from '../_lib/rbac.js';
import type { Permission, Role } from '../_lib/types.js';
import { CommercialReason } from '../_lib/commercialReason.js';
import { GATED_IN_HANDLER, LAPSED_COACH_ALLOWED, assertCoachCanWrite } from '../_lib/coachEntitlement.js';

/**
 * Error shape: the default tRPC shape plus `data.reason` — a stable machine
 * code for commercial refusals (SUBSCRIPTION_EXPIRED, CLIENT_CAPACITY_REACHED,
 * …; see _lib/commercialReason.ts) so clients never parse message text.
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause instanceof CommercialReason ? error.cause : undefined;
    if (!cause) return shape;
    return { ...shape, data: { ...shape.data, reason: cause.reason, ...(cause.retryAfter != null ? { retryAfter: cause.retryAfter } : {}) } };
  },
});

export const router = t.router;
export const middleware = t.middleware;

/**
 * B3.8 (owner decision 4, P2): every MUTATION by an active coach account whose Forma plan has
 * lapsed or was suspended is refused (`SUBSCRIPTION_EXPIRED` / `SUBSCRIPTION_SUSPENDED`), unless it
 * is one of the few recovery / read-marker / client-protecting actions in `LAPSED_COACH_ALLOWED`.
 * Default-deny: a coach write added later is covered without touching this list. Runs before input
 * parsing, at execution time (a stale tab or an offline queue replay gets the same answer).
 * Non-active accounts keep their own, earlier refusals (`protectedProcedure`, `ACCOUNT_NOT_ACTIVE`).
 */
const coachPlanGate = t.middleware(async ({ ctx, type, path, next }) => {
  if (type === 'mutation' && ctx.user?.role === 'coach' && ctx.user.accountStatus === 'active' && !LAPSED_COACH_ALLOWED.has(path) && !GATED_IN_HANDLER.has(path)) {
    await assertCoachCanWrite(ctx.user);
  }
  return next();
});

export const publicProcedure = t.procedure.use(coachPlanGate);

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
export const authedProcedure = publicProcedure.use(({ ctx, next }) => {
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
