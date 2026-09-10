import type { VercelRequest, VercelResponse } from '@vercel/node';
import bannersIndexHandler from './_handlers/index.js';
import bannersDetailHandler from './_handlers/detail.js';
import forViewerHandler from './_handlers/for-viewer.js';
import flagsIndexHandler from './_handlers/flags-index.js';
import usageIndexHandler from './_handlers/usage-index.js';
import usageActiveDayHandler from './_handlers/usage-active-day.js';
import usageBumpHandler from './_handlers/usage-bump.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments: string[] = Array.isArray(req.query.path) ? req.query.path : req.query.path ? [req.query.path] : [];

  if (segments.length === 0) {
    return bannersIndexHandler(req, res);
  }

  if (segments.length === 1 && segments[0] === 'for-viewer') {
    return forViewerHandler(req, res);
  }

  if (segments.length === 1 && segments[0] === 'flags') {
    return flagsIndexHandler(req, res);
  }

  if (segments.length === 1 && segments[0] === 'usage') {
    return usageIndexHandler(req, res);
  }

  if (segments.length === 2 && segments[0] === 'usage' && segments[1] === 'active-day') {
    return usageActiveDayHandler(req, res);
  }

  if (segments.length === 2 && segments[0] === 'usage' && segments[1] === 'bump') {
    return usageBumpHandler(req, res);
  }

  if (segments.length === 1) {
    req.query.id = segments[0];
    return bannersDetailHandler(req, res);
  }

  res.status(404).json({ error: 'Not found' });
}
