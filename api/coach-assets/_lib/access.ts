import type { VercelRequest } from '@vercel/node';
import { hasPermission } from '../../_lib/rbac.js';
import { requireActive, requireRole, requireUser, type AuthedUser } from '../../_lib/withAuth.js';
import { HttpError } from '../../_lib/http.js';

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
 */

/** Resolves the coachId a request targets: an explicit `?coachId=`/body value, or the caller's own id. */
export function resolveCoachId(req: VercelRequest, user: AuthedUser): string {
  const raw = req.query?.coachId;
  const fromQuery = Array.isArray(raw) ? raw[0] : raw;
  return fromQuery || user.id;
}

/** Throws 403 unless the caller owns `coachId` or holds oversight (`users.read`). */
export function requireReadAccess(user: AuthedUser, coachId: string): void {
  if (user.id === coachId) return;
  if (hasPermission(user.role, user.accountStatus, user.permissions, 'users.read')) return;
  throw new HttpError(403, 'Forbidden');
}

/**
 * Authenticates + requires the caller to be an active coach (writes only).
 * Writes are always scoped to the caller's OWN `coachId` — there is no
 * "write as another coachId" case, so callers should use `user.id` as the
 * document's `coachId`, never a client-supplied value.
 */
export async function requireOwningCoach(req: VercelRequest): Promise<AuthedUser> {
  const user = await requireUser(req);
  requireRole(user, 'coach');
  requireActive(user);
  return user;
}

/** Authenticates for a read route; returns the user + the resolved target coachId. */
export async function requireReadContext(req: VercelRequest): Promise<{ user: AuthedUser; coachId: string }> {
  const user = await requireUser(req);
  const coachId = resolveCoachId(req, user);
  requireReadAccess(user, coachId);
  return { user, coachId };
}
