import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { passwordResetsCol, usersCol } from '../../_lib/mongodb.js';
import { hashPassword } from '../../_lib/password.js';
import { hashRawToken, revokeAllUserSessions } from '../../_lib/tokens.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';

const Body = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const body = Body.parse(req.body);
    const resets = await passwordResetsCol();
    const tokenHash = hashRawToken(body.token);
    const reset = await resets.findOne({ _id: tokenHash });
    if (!reset || reset.used || reset.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, 'This reset link is invalid or has expired.');
    }
    const users = await usersCol();
    await users.updateOne(
      { _id: reset.userId },
      { $set: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, updatedAt: Date.now() } },
    );
    await resets.updateOne({ _id: tokenHash }, { $set: { used: true } });
    await revokeAllUserSessions(reset.userId);
    res.status(200).json({ ok: true });
  } catch (e) {
    handleError(res, e);
  }
}
