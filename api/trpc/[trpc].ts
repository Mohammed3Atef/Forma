import type { VercelRequest, VercelResponse } from '@vercel/node';
import { nodeHTTPRequestHandler } from '@trpc/server/adapters/node-http';
import { getPathSegments } from '../_lib/routePath.js';
import { appRouter } from '../_trpc/router.js';
import { createContext } from '../_trpc/context.js';

/**
 * The single tRPC entry point. Deliberately one Vercel function for the
 * whole (eventually complete) app router — this both keeps the project well
 * under Vercel's per-deployment function cap (the reason the old REST
 * dispatchers existed at all) and sidesteps a confirmed Vercel routing bug:
 * this project's catch-all functions (`[...path].ts`/`[[...path]].ts`) only
 * reliably route requests with EXACTLY one path segment — 2+ segments (e.g.
 * `/api/sync/deletions/pull`) and the zero-segment case on optional
 * catch-alls (e.g. bare `/api/banners`) both 404 at Vercel's edge, before
 * ever reaching the function (see the migration plan's Phase 0 findings).
 * tRPC's own convention — dotted procedure paths in a single segment, e.g.
 * `/api/trpc/banners.list`, batched calls joined by commas in that same
 * single segment — never triggers that bug, on this route or any other
 * module once it migrates here.
 *
 * Still uses the same `getPathSegments()` raw-URL parsing every other
 * dispatcher uses (not Vercel's populated `req.query`), for the same
 * documented reason: that population has proven unreliable in production
 * for this project.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = getPathSegments(req, '/api/trpc');
  const path = segments.join('/');
  await nodeHTTPRequestHandler({
    req,
    res,
    router: appRouter,
    path,
    createContext,
  });
}
