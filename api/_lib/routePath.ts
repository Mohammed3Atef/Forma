import type { VercelRequest } from '@vercel/node';

/**
 * Vercel's automatic population of `req.query.<param>` for a `[...param].ts`
 * / `[[...param]].ts` catch-all route has proven unreliable in production for
 * this project — the correct function is invoked, but the dynamic path
 * segment doesn't show up in `req.query`. Rather than depend on that platform
 * behavior, every catch-all router derives its segments directly from the raw
 * request URL instead, which is always present regardless of how Vercel's
 * dynamic-route query population behaves.
 *
 * `modulePrefix` is the module's own mount path, e.g. `/api/auth`.
 */
export function getPathSegments(req: VercelRequest, modulePrefix: string): string[] {
  const url = req.url ?? '';
  const pathname = url.split('?')[0] ?? '';
  const rest = (pathname.startsWith(modulePrefix) ? pathname.slice(modulePrefix.length) : pathname)
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!rest) return [];
  return rest.split('/').map((s) => decodeURIComponent(s));
}
