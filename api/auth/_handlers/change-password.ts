import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { usersCol } from '../../_lib/mongodb.js';
import { hashPassword, verifyPassword } from '../../_lib/password.js';
import { requireUser } from '../../_lib/withAuth.js';
import { revokeAllUserSessions } from '../../_lib/tokens.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const user = await requireUser(req);
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
