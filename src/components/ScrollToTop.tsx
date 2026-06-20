import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets scroll to the top on every route change. SPAs keep the previous
 * scroll position when the URL changes; this makes each page open at the top.
 * Mounted once inside the router.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    // Reset any scrollable main container too (in case it scrolls instead of the window).
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
