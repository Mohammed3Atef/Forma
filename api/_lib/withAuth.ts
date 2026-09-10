import type { VercelRequest } from '@vercel/node';
import { usersCol } from './mongodb';
import { hasPermission } from './rbac';
import { verifyAccessToken } from './tokens';
import { HttpError } from './http';
import type { AccountStatus, Permission, Role, UserDoc } from './types';

export interface AuthedUser {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  permissions: Permission[];
  doc: UserDoc;
}

/**
 * Verifies the Authorization: Bearer <accessToken> header and re-reads the
 * live user doc from Mongo (rather than trusting the JWT's role/status
 * claims) — this mirrors how firestore.rules' `me()` always re-reads the
 * live `users/{uid}` doc, so a suspend/role-change takes effect on the very
 * next request instead of waiting for the access token to expire.
 */
export async function requireUser(req: VercelRequest): Promise<AuthedUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Not authenticated');
  let subjectId: string;
  try {
    subjectId = verifyAccessToken(header.slice(7)).sub;
  } catch {
    throw new HttpError(401, 'Session expired');
  }
  const users = await usersCol();
  const doc = await users.findOne({ _id: subjectId });
  if (!doc) throw new HttpError(401, 'Account not found');
  return { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
}

export function requireRole(user: AuthedUser, ...roles: Role[]): void {
  if (!roles.includes(user.role)) throw new HttpError(403, 'Forbidden');
}

export function requireActive(user: AuthedUser): void {
  if (user.accountStatus !== 'active') throw new HttpError(403, 'Account is not active');
}

export function requirePermission(user: AuthedUser, perm: Permission): void {
  if (!hasPermission(user.role, user.accountStatus, user.permissions, perm)) {
    throw new HttpError(403, 'Forbidden');
  }
}
