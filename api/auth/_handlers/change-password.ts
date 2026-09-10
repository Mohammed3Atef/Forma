import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword, verifyPassword } from '../../_lib/password.js';
import { requireActive, requireUser } from '../../_lib/withAuth.js';
import { revokeAllUserSessions } from '../../_lib/tokens.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { enforceRateLimit } from '../../_lib/rateLimit.js';

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

// 5 attempts / hour per account — this route re-checks the current password,
// so it's effectively a login guess surface too.
const CHANGE_PW_MAX_ATTEMPTS = 5;
const CHANGE_PW_WINDOW_MS = 60 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
    requireActive(user);
    await enforceRateLimit('auth.changePassword', user.id, CHANGE_PW_MAX_ATTEMPTS, CHANGE_PW_WINDOW_MS);
    const body = Body.parse(req.body);
    if (!(await verifyPassword(body.currentPassword, user.doc.passwordHash))) {
      throw new HttpError(401, 'Current password is incorrect.');
    }
    const users = await usersCol();
    await users.updateOne(
      { _id: user.id },
      { $set: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, updatedAt: Date.now() } },
    );
    // Force every other signed-in device to re-authenticate.
    await revokeAllUserSessions(user.id);
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
