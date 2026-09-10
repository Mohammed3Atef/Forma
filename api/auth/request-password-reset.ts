import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { passwordResetsCol, usersCol } from '../_lib/mongodb';
import { generateRawToken, hashRawToken } from '../_lib/tokens';
import { handleError, methodGuard } from '../_lib/http';

const Body = z.object({ email: z.string().trim().toLowerCase().email() });
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * TODO before this is production-usable: wire in a real email provider (e.g.
 * Resend) to actually deliver the reset link — this route currently only
 * creates the token and logs it server-side outside production. Replaces
 * Firebase Auth's built-in sendPasswordResetEmail, which this project used
 * to get "for free"; a transactional email provider is a new dependency this
 * migration introduces.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const body = Body.parse(req.body);
    const users = await usersCol();
    const user = await users.findOne({ emailLower: body.email });
    // Always respond 200 regardless of whether the account exists, so this
    // endpoint can't be used to enumerate registered emails.
    if (user) {
      const raw = generateRawToken();
      const resets = await passwordResetsCol();
      await resets.insertOne({
        _id: hashRawToken(raw),
        userId: user._id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        used: false,
      });
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[auth] password reset token for ${user.email}: ${raw}`);
      } else {
        console.warn('[auth] password reset requested but no email provider is configured — token was not delivered.');
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    handleError(res, e);
  }
}
