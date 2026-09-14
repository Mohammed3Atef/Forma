import { TRPCError } from '@trpc/server';
import { hasPermission } from '../../_lib/rbac.js';
import type { AuthedUser } from '../../_trpc/context.js';

/**
 * Access control for `coachAssets/*` routes, reproducing
 * `firestore.rules`' `coachAssets/{coachId}/{document=**}` match block:
 *
 *   allow read:  if isSignedIn() && (request.auth.uid == coachId || hasPermission('users.read'));
 *   allow write: if isActive() && request.auth.uid == coachId;
 *
 * Note the read rule really does grant any signed-in holder of `users.read`
 * (which includes the `coach` role itself, per `rbac.ts`'s ROLE_PERMISSIONS)
 * — this is a faithful port of the existing rule, not a redesign.
 *
 * tRPC-native: writes are scoped to the caller's own id via `roleProcedure
 * ('coach')` (which already implies active, via `protectedProcedure`) at the
 * call site, so there is no `requireOwningCoach` here anymore — only the
 * read-side check, which depends on the resolved target coachId from input.
 */

/** Resolves the coachId a call targets: an explicit input value, or the caller's own id. */
export function resolveCoachId(inputCoachId: string | undefined, user: AuthedUser): string {
  return inputCoachId || user.id;
}

/** Throws FORBIDDEN unless the caller owns `coachId` or holds oversight (`users.read`). */
export function requireReadAccess(user: AuthedUser, coachId: string): void {
  if (user.id === coachId) return;
  if (hasPermission(user.role, user.accountStatus, user.permissions, 'users.read')) return;
  throw new TRPCError({ code: 'FORBIDDEN' });
}
