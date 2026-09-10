import type { VercelRequest, VercelResponse } from '@vercel/node';
import messagesIndex from './_handlers/index.js';
import messagesMarkRead from './_handlers/mark-read.js';
import notificationsIndex from './_handlers/notifications-index.js';
import notificationsMarkRead from './_handlers/notifications-mark-read.js';

/**
 * Catch-all router for `/api/messages/*`, consolidating what used to be
 * separate `api/messages/*` and `api/notifications/*` serverless functions
 * into one (Vercel Hobby plan caps functions per deployment). `[[...path]]`
 * (optional catch-all) so bare `/api/messages` (zero extra segments) still
 * resolves here and is answered by the messages index handler.
 *
 *   /api/messages                         -> messages index (list/send)
 *   /api/messages/mark-read               -> messages mark-read
 *   /api/messages/notifications           -> notifications index (was /api/notifications)
 *   /api/messages/notifications/mark-read -> notifications mark-read (was /api/notifications/mark-read)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments: string[] = Array.isArray(req.query.path) ? req.query.path : req.query.path ? [req.query.path] : [];

  if (segments.length === 0) {
    return messagesIndex(req, res);
  }
  if (segments.length === 1 && segments[0] === 'mark-read') {
    return messagesMarkRead(req, res);
  }
  if (segments.length === 1 && segments[0] === 'notifications') {
    return notificationsIndex(req, res);
  }
  if (segments.length === 2 && segments[0] === 'notifications' && segments[1] === 'mark-read') {
    return notificationsMarkRead(req, res);
  }

  res.status(404).json({ error: 'Not found' });
}
