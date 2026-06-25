import { useEffect, useMemo, useState } from 'react';

export interface Pagination<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  total: number;
  /** 1-based index of the first item shown (0 when empty). */
  from: number;
  /** 1-based index of the last item shown. */
  to: number;
  pageSize: number;
  canPrev: boolean;
  canNext: boolean;
  setPage: (p: number) => void;
  next: () => void;
  prev: () => void;
}

/**
 * Client-side pagination over an in-memory array. The list pages already fetch
 * their rows up front (filtering/sorting happens in memory at this scale), so
 * this just controls how many render at once — keeping long admin/coach lists
 * navigable without rendering thousands of rows.
 *
 * Pass `resetKey` (e.g. the active search/filter string) to jump back to page 1
 * whenever the underlying result set changes.
 */
export function usePagination<T>(items: T[], pageSize = 25, resetKey?: unknown): Pagination<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Back to the first page when the filter/sort changes.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);
  // Keep the page in range if the result set shrinks under us.
  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);

  return {
    page: clamped,
    totalPages,
    pageItems,
    total,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    pageSize,
    canPrev: clamped > 1,
    canNext: clamped < totalPages,
    setPage,
    next: () => setPage((p) => Math.min(p + 1, totalPages)),
    prev: () => setPage((p) => Math.max(p - 1, 1)),
  };
}
