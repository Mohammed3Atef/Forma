import type { VercelRequest, VercelResponse } from '@vercel/node';
import stats from './_handlers/stats.js';
import members from './_handlers/members.js';
import growth from './_handlers/growth.js';
import coachesList from './_handlers/coaches-list.js';
import audit from './_handlers/audit.js';
import coachesDetail from './_handlers/coaches-detail.js';
import usersIndex from './_handlers/users-index.js';
import usersByRole from './_handlers/users-by-role.js';
import usersSearchClients from './_handlers/users-search-clients.js';
import usersBulkStatus from './_handlers/users-bulk-status.js';
import usersDetail from './_handlers/users-detail.js';
import usersStatus from './_handlers/users-status.js';
import usersRole from './_handlers/users-role.js';
import usersPermissions from './_handlers/users-permissions.js';

/**
 * Vercel catch-all router for `api/admin/*` — consolidates what used to be
 * 14 separate serverless functions into one, to stay under the Hobby plan's
 * per-deployment function cap. Dispatches on `req.query.path` (populated by
 * Vercel from the `[...path]` segment) and, for routes that previously relied
 * on a `[id].ts`-style filename to populate `req.query.id`, sets that manually
 * before delegating.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.path;
  const path = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];

  if (path.length === 1 && path[0] === 'stats') {
    return stats(req, res);
  }
  if (path.length === 1 && path[0] === 'members') {
    return members(req, res);
  }
  if (path.length === 1 && path[0] === 'growth') {
    return growth(req, res);
  }
  if (path.length === 1 && path[0] === 'coaches') {
    return coachesList(req, res);
  }
  if (path.length === 1 && path[0] === 'audit') {
    return audit(req, res);
  }
  if (path.length === 2 && path[0] === 'coaches') {
    req.query.id = path[1];
    return coachesDetail(req, res);
  }
  if (path.length === 1 && path[0] === 'users') {
    return usersIndex(req, res);
  }
  if (path.length === 2 && path[0] === 'users' && path[1] === 'by-role') {
    return usersByRole(req, res);
  }
  if (path.length === 2 && path[0] === 'users' && path[1] === 'search-clients') {
    return usersSearchClients(req, res);
  }
  if (path.length === 2 && path[0] === 'users' && path[1] === 'bulk-status') {
    return usersBulkStatus(req, res);
  }
  if (path.length === 3 && path[0] === 'users' && path[2] === 'status') {
    req.query.id = path[1];
    return usersStatus(req, res);
  }
  if (path.length === 3 && path[0] === 'users' && path[2] === 'role') {
    req.query.id = path[1];
    return usersRole(req, res);
  }
  if (path.length === 3 && path[0] === 'users' && path[2] === 'permissions') {
    req.query.id = path[1];
    return usersPermissions(req, res);
  }
  if (path.length === 2 && path[0] === 'users') {
    req.query.id = path[1];
    return usersDetail(req, res);
  }

  res.status(404).json({ error: 'Not found' });
}
