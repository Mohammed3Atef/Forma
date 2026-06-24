import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 * Used only where layout truly forks in JS (shell redirect, master-detail
 * selection, split views) — pure show/hide chrome uses Tailwind `md:`/`lg:`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tailwind `md` and up (≥768px) — tablet or wider; drives the sidebar shell. */
export const useIsTabletUp = () => useMediaQuery('(min-width: 768px)');
/** Tailwind `lg` and up (≥1024px) — desktop; drives tables, master-detail, split views. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
