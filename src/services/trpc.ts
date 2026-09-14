import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../api/_trpc/router';
import { getAccessToken, refreshSession } from './platformApi';

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
async function trpcFetch(input: RequestInfo | URL, init: RequestInit | undefined, isRetry = false): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && !isRetry) {
    if (await refreshSession()) return trpcFetch(input, init, true);
  }
  return res;
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      fetch: (input, init) => trpcFetch(input, init),
    }),
  ],
});

export { TRPCClientError };
