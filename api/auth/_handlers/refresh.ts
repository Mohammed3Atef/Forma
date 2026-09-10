import type { VercelRequest, VercelResponse } from '@vercel/node';
import { usersCol } from '../../_lib/mongodb.js';
import { findValidRefreshToken, readRefreshCookie, rotateSession } from '../../_lib/tokens.js';
import { HttpError, handleError, methodGuard } from '../../_lib/http.js';
import { toPublicUser } from '../../_lib/types.js';

/**
 * Exchanges the httpOnly refresh cookie for a fresh access token (and rotates
 * the refresh token). Also returns the current user doc so the frontend can
 * pick up a role/status change without a separate /auth/me round-trip — the
 * same "re-read on resume" behaviour App.tsx already relies on today via
 * refreshAccount() on visibilitychange.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const raw = readRefreshCookie(req.cookies);
    if (!raw) throw new HttpError(401, 'No session');
    const tokenDoc = await findValidRefreshToken(raw);
    if (!tokenDoc) throw new HttpError(401, 'Session expired');
    const users = await usersCol();
    const user = await users.findOne({ _id: tokenDoc.userId });
    if (!user) throw new HttpError(401, 'Account not found');
    const session = await rotateSession(res, raw, { id: user._id, role: user.role, accountStatus: user.accountStatus });
    res.status(200).json({ user: toPublicUser(user), accessToken: session.accessToken });
  } catch (e) {
    handleError(res, e);
  }
}
