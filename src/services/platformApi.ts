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
 * Raw (non-tRPC-client) call to `auth.refresh` — deliberately NOT routed
 * through `src/services/trpc.ts`'s `trpc` client, since that client's own
 * `httpBatchLink` fetch wrapper calls back into THIS function on a 401,
 * which would recurse. Same wire format tRPC's node-http adapter expects for
 * a single (non-batched) mutation: POST with a plain JSON body, response
 * unwrapped from `{result:{data:...}}`.
 */
async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/trpc/auth.refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { result?: { data?: { accessToken?: string } } };
    const accessToken = body.result?.data?.accessToken;
    if (!accessToken) return false;
    setAccessToken(accessToken);
    return true;
  } catch {
    return false;
  }
}

/** Exposed only for `mongoAuth.restoreSession()` — everyone else should never need to call this directly. */
export { tryRefresh as refreshSession };
