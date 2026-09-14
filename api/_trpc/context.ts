import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAccessToken } from '../_lib/tokens.js';
import { usersCol } from '../_lib/mongodb.js';
import type { AccountStatus, Permission, Role, UserDoc } from '../_lib/types.js';

/**
 * Same shape as `api/_lib/withAuth.ts`'s `AuthedUser` — kept as a separate
 * type here (not imported from `withAuth.ts`) because that file's
 * `requireUser()` throws on a missing/invalid token, whereas tRPC context
 * creation must never throw for public procedures (e.g. `auth.login`) to
 * still get a context. `protectedProcedure`'s middleware (in `./trpc.ts`) is
 * what turns a null `user` into a 401, mirroring `requireUser()`'s behavior
 * only for procedures that actually require it.
 */
export interface AuthedUser {
  id: string;
  role: Role;
  accountStatus: AccountStatus;
  permissions: Permission[];
  doc: UserDoc;
}

export interface Context {
  req: VercelRequest;
  res: VercelResponse;
  user: AuthedUser | null;
}

export async function createContext({ req, res }: { req: VercelRequest; res: VercelResponse }): Promise<Context> {
  const header = req.headers.authorization;
  let user: AuthedUser | null = null;

  if (header?.startsWith('Bearer ')) {
    try {
      const { sub } = verifyAccessToken(header.slice(7));
      const users = await usersCol();
      const doc = await users.findOne({ _id: sub });
      if (doc) {
        user = { id: doc._id, role: doc.role, accountStatus: doc.accountStatus, permissions: doc.permissions, doc };
      }
    } catch {
      // Invalid/expired token — leave user null; protectedProcedure rejects downstream.
    }
  }

  return { req, res, user };
}
