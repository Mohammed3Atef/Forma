/**
 * The single source of truth for the in-memory access token used by
 * `src/services/trpc.ts` — critical because that token has to be ONE copy
 * across the whole app, not one per file.
 *
 * The access token lives in memory only (never localStorage/sessionStorage).
 * A page reload calls `mongoAuth`'s session restore, which exchanges the
 * httpOnly refresh cookie (set by the backend, `Path=/`) for a fresh access
 * token via `setAccessToken()` below.
 *
 * The REST-era `apiFetch`/`apiGet`/`apiPost`/`apiPut`/`apiPatch`/`apiDelete`/
 * `ApiError` helpers that used to live here were removed once the tRPC
 * migration retired the last caller (the `sync` module, migrated last) —
 * every backend call now goes through `src/services/trpc.ts`'s `trpc` client
 * instead.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * Outcome of a refresh attempt (B0 / PWA-01). Only `unauthorized` — the server
 * explicitly said the session is gone (no cookie, expired, revoked) — may end a
 * session. `network` (offline, timeout, DNS, aborted) and `error` (5xx, bad
 * response) are transient: the caller keeps the user signed in and retries.
 */
export type RefreshOutcome = 'ok' | 'unauthorized' | 'network' | 'error';

/** A connection that is "up" but passes no data must never hang boot forever. */
export const REFRESH_TIMEOUT_MS = 10_000;

async function refreshOnce(): Promise<RefreshOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch('/api/trpc/auth.refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) return 'unauthorized';
    if (!res.ok) return 'error';
    const body = (await res.json()) as { result?: { data?: { accessToken?: string; user?: unknown } } };
    const token = body.result?.data?.accessToken;
    if (!token) return 'error';
    setAccessToken(token);
    // The refresh answer already carries the user — keep it so boot doesn't
    // need a second, serial `auth.me` round-trip (B1.13 / PF-01).
    refreshedUser = body.result?.data?.user ?? null;
    refreshedAt = Date.now();
    return 'ok';
  } catch {
    return 'network';
  } finally {
    clearTimeout(timer);
  }
}

let inFlight: Promise<RefreshOutcome> | null = null;
let refreshedUser: unknown = null;
let refreshedAt = 0;

/**
 * The user record returned by a refresh that JUST succeeded (consumed once).
 * Older than `maxAgeMs` it is ignored — a refresh done earlier for a 401 retry
 * must not stand in for a fresh status check minutes later.
 */
export function takeRefreshedUser<T>(maxAgeMs = 5_000): T | null {
  const u = Date.now() - refreshedAt <= maxAgeMs ? (refreshedUser as T | null) : null;
  refreshedUser = null;
  return u;
}

/**
 * Raw (non-tRPC-client) call to `auth.refresh` — deliberately NOT routed
 * through `src/services/trpc.ts`'s `trpc` client, since that client's own
 * `httpBatchLink` fetch wrapper calls back into THIS function on a 401,
 * which would recurse. Same wire format tRPC's node-http adapter expects for
 * a single (non-batched) mutation: POST with a plain JSON body, response
 * unwrapped from `{result:{data:...}}`.
 *
 * Single-flight: concurrent callers (several queries hitting a 401 at once,
 * boot + foreground) share ONE request — the server rotates the refresh
 * token, so a second parallel refresh with the old cookie would lose the race
 * and look like a sign-out (PF-10). An `unauthorized` answer is retried once
 * after a short pause, because another TAB may have just rotated the cookie
 * (the retry then carries the new one).
 */
export function refreshSessionDetailed(): Promise<RefreshOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let outcome = await refreshOnce();
    if (outcome === 'unauthorized') {
      await new Promise((r) => setTimeout(r, 400));
      outcome = await refreshOnce();
    }
    return outcome;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Boolean form for the tRPC 401-retry path (retry only when a fresh token was obtained). */
export async function refreshSession(): Promise<boolean> {
  return (await refreshSessionDetailed()) === 'ok';
}
