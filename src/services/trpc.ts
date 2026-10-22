import { createTRPCClient, httpBatchLink, TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '../../api/_trpc/router';
import { getAccessToken, refreshSession } from './platformApi';
import { emitPlanLapsed } from './platform/planLapseSignal';

/**
 * Vanilla (non-React-Query) tRPC client. The `src/services/platform/*.ts`
 * files this backs keep the same plain-async-function shape they've always
 * had, so callers elsewhere in the app don't change as modules migrate.
 *
 * Reuses `platformApi.ts`'s in-memory access token as the single source of
 * truth (not a second copy) and reproduces `apiFetch()`'s exactly-one-retry-
 * on-401 refresh behavior via a custom `fetch` passed to `httpBatchLink` —
 * tRPC's link pipeline doesn't call through `apiFetch()` directly, so this
 * one piece of its logic has to be deliberately reproduced here.
 */
/**
 * Every request gets a deadline (B0 / PWA-01): a connection that is "up" but
 * passes no data (gym Wi-Fi, captive portals, dead cell) otherwise leaves a
 * query or a boot step pending forever. A timeout surfaces as a normal
 * network error, which callers already treat as "offline / retry".
 */
export const REQUEST_TIMEOUT_MS = 30_000;

function withTimeout(signal: AbortSignal | null | undefined): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function trpcFetch(input: RequestInfo | URL, init: RequestInit | undefined, isRetry = false): Promise<Response> {
  const token = getAccessToken();
  const deadline = withTimeout(init?.signal);
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      signal: deadline.signal,
      credentials: 'include',
      headers: {
        ...(init?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } finally {
    deadline.done();
  }
  if (res.status === 401 && !isRetry) {
    if (await refreshSession()) return trpcFetch(input, init, true);
  }
  return res;
}

/**
 * B3.8 (P2): every write the server refuses because the coach's Forma plan lapsed or was suspended
 * is announced (`planLapseSignal`), whoever made it — the coach app then re-reads the plan and turns
 * read-only everywhere. The error itself still reaches the caller unchanged.
 */
const planLapseLink: TRPCLink<AppRouter> = () => ({ next, op }) =>
  observable((observer) =>
    next(op).subscribe({
      next: (value) => observer.next(value),
      error: (err) => {
        if (op.type === 'mutation') emitPlanLapsed((err as { data?: { reason?: unknown } }).data?.reason as string | undefined);
        observer.error(err);
      },
      complete: () => observer.complete(),
    }),
  );

export const trpc = createTRPCClient<AppRouter>({
  links: [
    planLapseLink,
    httpBatchLink({
      url: '/api/trpc',
      fetch: (input, init) => trpcFetch(input, init),
    }),
  ],
});

export { TRPCClientError };
