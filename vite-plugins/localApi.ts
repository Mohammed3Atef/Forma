import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Runs the app's ENTIRE backend (`api/trpc/[trpc].ts` — the single tRPC entry
 * point every route is dispatched through, see that file's own comment)
 * directly inside `vite dev`, so `npm run dev` alone is enough for local
 * development — no `vercel dev` / Vercel CLI / linked Vercel project needed.
 *
 * How this is safe: the handler and everything it calls only ever imports
 * `@vercel/node` for TYPES (`grep -rn "from '@vercel/node'" api/` matches
 * nothing but `import type` — verified, not assumed), and tRPC's own
 * `nodeHTTPRequestHandler` adapter is written for a plain Node
 * `http.IncomingMessage`/`http.ServerResponse` pair: when the request object
 * has no `body` property (true for Vite's raw middleware `req`, unlike
 * Vercel's runtime which pre-parses one onto `VercelRequest.body`), the
 * adapter reads the raw body stream itself — the exact same code path Vercel
 * falls back to for a non-JSON body. So request/response handling needs no
 * shim at all. The backend also never reads `req.query` (a documented,
 * deliberate choice — see `api/_lib/routePath.ts`), so the only real gap
 * between a raw Node request and a `VercelRequest` this app's code actually
 * touches is `req.cookies` (used by the refresh-token cookie in
 * `api/_trpc/routers/auth.ts`), which is shimmed below by parsing the
 * `Cookie` header the same way Vercel's runtime does.
 *
 * Loaded via Vite's `ssrLoadModule`, so editing any `api/**' file hot-reloads
 * it on the next request — no restart needed, same as the frontend.
 */
export function localApiPlugin(): Plugin {
  return {
    name: 'forma-local-api',
    apply: 'serve', // dev-server only — never runs during `vite build`
    configureServer(server) {
      // The other two Vercel functions, mounted the same way so uploads and
      // the cron can be exercised locally too. Connect strips the mount prefix
      // from `req.url`; the handlers parse the FULL path, so restore it.
      for (const [prefix, file] of [
        ['/api/media', '/api/media/[action].ts'],
        ['/api/cron/daily-maintenance', '/api/cron/daily-maintenance.ts'],
      ] as const) {
        server.middlewares.use(prefix, async (req: IncomingMessage, res: ServerResponse) => {
          try {
            req.url = `${prefix}${req.url === '/' ? '' : req.url ?? ''}`;
            const mod = await server.ssrLoadModule(file);
            (req as IncomingMessage & { cookies: Record<string, string> }).cookies = parseCookies(req.headers.cookie);
            const shimRes = withJsonHelpers(res);
            await (mod.default as (req: unknown, res: unknown) => Promise<void>)(req, shimRes);
          } catch (e) {
            server.config.logger.error(`[local-api] ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Local API handler crashed' }));
            }
          }
        });
      }
      server.middlewares.use('/api/trpc', async (req: IncomingMessage, res: ServerResponse, next) => {
        try {
          const mod = await server.ssrLoadModule('/api/trpc/[trpc].ts');
          const handler = mod.default as (req: unknown, res: unknown) => Promise<void>;
          (req as IncomingMessage & { cookies: Record<string, string> }).cookies = parseCookies(req.headers.cookie);
          await handler(req, res);
        } catch (e) {
          server.config.logger.error(`[local-api] ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Local API handler crashed — see the terminal running `npm run dev`.' }));
          } else {
            next(e instanceof Error ? e : new Error(String(e)));
          }
        }
      });
    },
  };
}

/** Same parsing Vercel's runtime does for `VercelRequest.cookies`: a plain `{name: value}` map from the `Cookie` header. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      out[name] = part.slice(eq + 1).trim();
    }
  }
  return out;
}

/** The `res.status(n).json(body)` helpers Vercel adds to `VercelResponse` (used by the media + cron handlers). */
function withJsonHelpers(res: ServerResponse): ServerResponse & { status: (n: number) => unknown; json: (b: unknown) => unknown } {
  const r = res as ServerResponse & { status: (n: number) => typeof r; json: (b: unknown) => typeof r };
  r.status = (n: number) => {
    res.statusCode = n;
    return r;
  };
  r.json = (b: unknown) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(b));
    return r;
  };
  return r;
}
