import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPathSegments } from '../_lib/routePath.js';
import coachClientsIndex from './_handlers/index.js';
import coachClientsDetail from './_handlers/detail.js';
import invitesIndex from './_handlers/invites-index.js';
import invitesClaim from './_handlers/invites-claim.js';
import invitesCode from './_handlers/invites-code.js';
import transfersIndex from './_handlers/transfers-index.js';
import transfersDetail from './_handlers/transfers-detail.js';

/**
 * Catch-all router for `/api/coach-clients/*`, consolidating what used to be
 * separate `api/coach-clients/*`, `api/invites/*`, and `api/transfers/*`
 * serverless functions into one (Vercel Hobby plan caps functions per
 * deployment). `[[...path]]` (optional catch-all) so bare `/api/coach-clients`
 * (zero extra segments) still resolves here and is answered by the
 * coach-clients index handler.
 *
 *   /api/coach-clients                    -> coach-clients index (list/assign)
 *   /api/coach-clients/invites            -> invites index (was /api/invites)
 *   /api/coach-clients/invites/claim      -> invites claim (was /api/invites/claim)
 *   /api/coach-clients/invites/:code      -> invites code lookup/revoke (was /api/invites/:code)
 *   /api/coach-clients/transfers          -> transfers index (was /api/transfers)
 *   /api/coach-clients/transfers/:id      -> transfers detail (was /api/transfers/:id)
 *   /api/coach-clients/:id                -> coach-clients detail (relationship id, e.g. `${coachId}__${clientId}`)
 *
 * Literal 'invites'/'transfers' prefixes are checked BEFORE the generic
 * dynamic-id fallback — a real coachClients relationship id is a composite
 * string (`${coachId}__${clientId}`) and will never literally equal 'invites'
 * or 'transfers'.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments: string[] = getPathSegments(req, '/api/coach-clients');

  if (segments.length === 0) {
    return coachClientsIndex(req, res);
  }

  if (segments[0] === 'invites') {
    if (segments.length === 1) {
      return invitesIndex(req, res);
    }
    if (segments.length === 2 && segments[1] === 'claim') {
      return invitesClaim(req, res);
    }
    if (segments.length === 2) {
      req.query.code = segments[1];
      return invitesCode(req, res);
    }
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (segments[0] === 'transfers') {
    if (segments.length === 1) {
      return transfersIndex(req, res);
    }
    if (segments.length === 2) {
      req.query.id = segments[1];
      return transfersDetail(req, res);
    }
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (segments.length === 1) {
    req.query.id = segments[0];
    return coachClientsDetail(req, res);
  }

  res.status(404).json({ error: 'Not found' });
}
