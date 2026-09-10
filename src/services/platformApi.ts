/**
 * Shared client for the Mongo-backed `/api/*` backend. Every rewritten
 * `src/services/platform/*.ts` file (and `src/services/auth/mongoAuth.ts`)
 * goes through this module instead of each keeping its own fetch/retry logic
 * — critical because the in-memory access token has to be a SINGLE source of
 * truth across the whole app, not one copy per file.
 *
 * The access token lives in memory only (never localStorage/sessionStorage).
 * A page reload calls `mongoAuth`'s session restore, which exchanges the
 * httpOnly refresh cookie (set by the backend, `Path=/api/auth`) for a fresh
 * access token via `setAccessToken()` below.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const body = (await res.json()) as { accessToken: string };
    setAccessToken(body.accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch wrapper for every `/api/*` route: attaches the bearer token + refresh
 * cookie, retries exactly once on a 401 by refreshing the session first, and
 * throws `ApiError` on any non-2xx response so callers can `catch` a single
 * error type. `path` is relative to `/api` (e.g. `/coach-plans/me`).
 */
export async function apiFetch<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && !isRetry && path !== '/auth/refresh' && path !== '/auth/login') {
    if (await tryRefresh()) return apiFetch<T>(path, init, true);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, (body && body.error) || `Request failed (${res.status})`, body?.details);
  }
  return body as T;
}

export const apiGet = <T>(path: string): Promise<T> => apiFetch<T>(path, { method: 'GET' });
export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });
export const apiPut = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined });
export const apiDelete = <T>(path: string): Promise<T> => apiFetch<T>(path, { method: 'DELETE' });

/** Exposed only for `mongoAuth.restoreSession()` — everyone else should never need to call this directly. */
export { tryRefresh as refreshSession };
