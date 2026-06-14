import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client for platform (admin/coach) server-state — online
 * reads of OTHER users' data. The client's own local-first data never uses this
 * (it stays on Zustand + the local DataSource + SyncEngine).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
