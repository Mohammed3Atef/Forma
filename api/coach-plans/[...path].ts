import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError, handleError } from '../_lib/http.js';
import { getPathSegments } from '../_lib/routePath.js';
import meHandler from './_handlers/me.js';
import trialHandler from './_handlers/trial.js';
import changeRequestHandler from './_handlers/change-request.js';
import adminPlanChangeRequestsHandler from './_handlers/admin-plan-change-requests.js';
import tiersIndexHandler from './_handlers/tiers-index.js';
import tiersDetailHandler from './_handlers/tiers-detail.js';
import detailHandler from './_handlers/detail.js';

/**
 * Catch-all for `/api/coach-plans/*`, consolidating the former per-file
 * routes (plus the former `api/plan-tiers/*` routes, absorbed here to reduce
 * Vercel serverless function count) into a single function.
 *
 * Routing (reserved literals are checked before the dynamic `:coachId`
 * fallback):
 *  - /api/coach-plans/me                       -> me handler
 *  - /api/coach-plans/trial                     -> trial handler
 *  - /api/coach-plans/change-request            -> change-request handler
 *  - /api/coach-plans/admin-plan-change-requests -> admin-plan-change-requests handler
 *  - /api/coach-plans/tiers                     -> tiers-index handler (was /api/plan-tiers)
 *  - /api/coach-plans/tiers/:tierKey            -> tiers-detail handler (was /api/plan-tiers/:tierKey)
 *  - /api/coach-plans/:coachId                  -> detail handler (admin override)
 *  - anything else                              -> 404
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = getPathSegments(req, '/api/coach-plans');

    if (path.length === 1 && path[0] === 'me') {
      return meHandler(req, res);
    }
    if (path.length === 1 && path[0] === 'trial') {
      return trialHandler(req, res);
    }
    if (path.length === 1 && path[0] === 'change-request') {
      return changeRequestHandler(req, res);
    }
    if (path.length === 1 && path[0] === 'admin-plan-change-requests') {
      return adminPlanChangeRequestsHandler(req, res);
    }
    if (path.length === 1 && path[0] === 'tiers') {
      return tiersIndexHandler(req, res);
    }
    if (path.length === 2 && path[0] === 'tiers') {
      req.query.tierKey = path[1];
      return tiersDetailHandler(req, res);
    }

    const RESERVED = new Set(['me', 'trial', 'change-request', 'admin-plan-change-requests', 'tiers']);
    if (path.length === 1 && !RESERVED.has(path[0])) {
      req.query.coachId = path[0];
      return detailHandler(req, res);
    }

    throw new HttpError(404, 'Not found');
  } catch (e) {
    handleError(res, e);
  }
}
