import { useEffect, useRef } from 'react';

/**
 * Returns a ref to attach to a sentinel element at the end of a list. When the
 * sentinel scrolls into view (and `enabled` is true), `onMore` fires — used to
 * drive React Query's `fetchNextPage` for card-based infinite scroll.
 */
export function useInfiniteScroll<T extends HTMLElement = HTMLDivElement>(
  onMore: () => void,
  enabled: boolean,
) {
  const ref = useRef<T>(null);
  const cb = useRef(onMore);
  cb.current = onMore;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cb.current();
      },
      { rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
