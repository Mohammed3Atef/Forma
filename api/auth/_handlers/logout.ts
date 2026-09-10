import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearRefreshCookie, readRefreshCookie, revokeRefreshToken } from '../../_lib/tokens.js';
import { handleError, methodGuard } from '../../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    methodGuard(req, 'POST');
    const raw = readRefreshCookie(req.cookies);
    if (raw) await revokeRefreshToken(raw);
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (e) {
    handleError(res, e);
  }
}
