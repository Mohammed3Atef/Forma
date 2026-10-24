import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Height that makes a full-height chat column end exactly at the top of the
 * fixed bottom nav, measured from the column's REAL top edge. A fixed
 * `100dvh - 8.5rem` assumed nothing renders above the thread — a subscription,
 * plan or reminder banner pushed the composer under the bottom nav, where it
 * could not be tapped at all (client: release gate cf3a5d9; coach: B0 / CO-04).
 * Re-measured whenever the page above changes size.
 *
 * `desktopBottom` is the space to leave below the column at ≥ md, where the
 * coach/admin shell shows a sidebar instead of the bottom nav (`null` = the
 * bottom nav is always shown). `minWidth` is where that switch happens: 768 px
 * for coach/admin, 1024 px for the client's side rail (B2).
 */
export function useFillToBottomNav(desktopBottom: string | null = null, minWidth = 768) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const [wide, setWide] = useState(() => desktopBottom != null && typeof window !== 'undefined' && !!window.matchMedia?.(`(min-width: ${minWidth}px)`).matches);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    measure();
    // Banners mount AFTER this page (their data loads later): watch the
    // containers they render into — <main> (subscription/plan banner) and the
    // app shell (reminder banner) — for size changes and inserted nodes.
    const main = el.parentElement;
    const shell = main?.parentElement ?? null;
    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    for (const n of [main, shell]) {
      if (!n) continue;
      ro.observe(n);
      mo.observe(n, { childList: true, subtree: false });
    }
    for (const sib of Array.from(main?.children ?? [])) if (sib !== el) ro.observe(sib);
    const mq = desktopBottom != null ? window.matchMedia?.(`(min-width: ${minWidth}px)`) : undefined;
    const onMq = () => {
      setWide(!!mq?.matches);
      measure();
    };
    mq?.addEventListener?.('change', onMq);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      mq?.removeEventListener?.('change', onMq);
      window.removeEventListener('resize', measure);
    };
  }, [desktopBottom, minWidth]);
  const below = wide && desktopBottom != null ? desktopBottom : 'var(--bottomnav-h) - env(safe-area-inset-bottom, 0px)';
  const height = top == null ? 'calc(100dvh - 8.5rem)' : `calc(100dvh - ${top}px - ${below})`;
  return { ref, height };
}
