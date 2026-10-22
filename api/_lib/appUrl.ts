/**
 * B39A-S01 (P0, fixed 2026-10-22) — the ONE origin every emailed link is built on: password reset,
 * client invites, welcome emails. It is NEVER taken from a request header (`Origin`, `Host`,
 * `X-Forwarded-Host`, `Forwarded`): those are attacker-controlled, and a reset link pointing at
 * another host hands its token to whoever owns that host.
 *
 * Source: the server's `APP_BASE_URL`. It must be a bare absolute origin — `https:` (or `http:` for
 * localhost / 127.0.0.1 outside production), no credentials, path, query or fragment. Production
 * without it uses the built-in canonical origin below (a constant in the code, never a request
 * value) and says so in the log. Anything else — an invalid value, or no value outside production
 * — throws `AppUrlError`, and the caller sends no email (a reset stores no token at all).
 */
export const CANONICAL_PRODUCTION_ORIGIN = 'https://www.useforma.fit';

export class AppUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppUrlError';
  }
}

type Env = Partial<Record<'APP_BASE_URL' | 'VERCEL_ENV' | 'NODE_ENV', string>>;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function isProduction(env: Env): boolean {
  // Vercel runs preview deployments with NODE_ENV=production too — only VERCEL_ENV tells them apart.
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

let warnedFallback = false;

/** The trusted origin for emailed links (no trailing slash). Throws `AppUrlError` when it cannot be trusted. */
export function trustedAppOrigin(env: Env = process.env as Env): string {
  const prod = isProduction(env);
  const raw = env.APP_BASE_URL?.trim();
  if (!raw) {
    if (!prod) throw new AppUrlError('APP_BASE_URL is not set: emailed links are disabled outside production');
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn(`[appUrl] APP_BASE_URL is not set — emailed links use the built-in ${CANONICAL_PRODUCTION_ORIGIN}`);
    }
    return CANONICAL_PRODUCTION_ORIGIN;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppUrlError('APP_BASE_URL is not a valid URL');
  }
  const loopback = LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !prod)) throw new AppUrlError('APP_BASE_URL must be https (http only for localhost outside production)');
  if (url.username || url.password) throw new AppUrlError('APP_BASE_URL must not carry credentials');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) throw new AppUrlError('APP_BASE_URL must be a bare origin (no path, query or fragment)');
  if (prod && loopback) throw new AppUrlError('APP_BASE_URL must not point at localhost in production');
  return url.origin;
}

/** An absolute link on the trusted origin. `path` must start with `/`. */
export function appLink(path: string, env?: Env): string {
  if (!path.startsWith('/') || path.startsWith('//')) throw new AppUrlError('A link path must start with a single "/"');
  return `${trustedAppOrigin(env)}${path}`;
}

/** Test hook: forget that the production fallback was already announced. */
export function resetAppUrlWarningForTests(): void {
  warnedFallback = false;
}

/**
 * For best-effort emails: the trusted origin, or null when it cannot be trusted — the reason is
 * logged (never a token or a link), and the caller sends nothing.
 */
export function tryTrustedAppOrigin(context: string): string | null {
  try {
    return trustedAppOrigin();
  } catch (e) {
    console.error(`${context}: not sent — ${(e as Error).message}`);
    return null;
  }
}
