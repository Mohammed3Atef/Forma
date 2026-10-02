import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client for platform (admin/coach) server-state — online
 * reads of OTHER users' data. The client's own local-first data never uses this
 * (it stays on Zustand + the local DataSource + SyncEngine).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Coach/admin run online as a web app: keep fetched data fresh for a
      // minute and retained for 10 so navigating between screens (clients →
      // detail → back) is instant from cache instead of re-fetching each time.
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      // There's no WebSocket/push layer (Vercel serverless can't hold one) —
      // this is how a coach/admin tab picks up another role's changes without
      // a manual reload: refetch stale queries when the TAB becomes visible
      // again. NOTE: React Query v5's focus manager listens to
      // `visibilitychange` only — plain window `focus` (two side-by-side
      // windows, both visible) does NOT refetch; those rely on each screen's
      // own polling. Verified in the Phase-3 browser E2E.
      refetchOnWindowFocus: true,
    },
  },
});
