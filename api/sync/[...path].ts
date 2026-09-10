import type { VercelRequest, VercelResponse } from '@vercel/node';
import pushHandler from './_handlers/push.js';
import pullHandler from './_handlers/pull.js';
import deletionsPushHandler from './_handlers/deletions-push.js';
import deletionsPullHandler from './_handlers/deletions-pull.js';
import singletonHandler from './_handlers/singleton.js';
import wipeHandler from './_handlers/wipe.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = Array.isArray(req.query.path) ? req.query.path : req.query.path ? [req.query.path] : [];
  const key = segments.join('/');
  switch (key) {
    case 'push': return pushHandler(req, res);
    case 'pull': return pullHandler(req, res);
    case 'deletions/push': return deletionsPushHandler(req, res);
    case 'deletions/pull': return deletionsPullHandler(req, res);
    case 'singleton': return singletonHandler(req, res);
    case 'wipe': return wipeHandler(req, res);
    default:
      res.status(404).json({ error: 'Not found' });
  }
}
