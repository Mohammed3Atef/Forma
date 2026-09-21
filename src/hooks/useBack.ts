import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { confirmLeave } from '@/stores/navGuardStore';

/**
 * The one back-navigation rule for the whole app: prefer real browser/in-app
 * back (so the URL, scroll position, filters and query params the user
 * actually had are restored exactly), and only fall back to a fixed
 * destination when there's nothing to go back to — a direct URL entry, a
 * notification/deep-link open, or a refresh (all of which mount this route as
 * the FIRST history entry, which react-router marks with the sentinel key
 * `'default'`; any real in-app navigation before it gets a random key).
 *
 * Always routes through `confirmLeave()` first, so a dirty editor's
 * unsaved-changes guard (see `useUnsavedGuard`) fires no matter which back
 * control — this one, a tab rail, or the bottom nav — triggered the exit.
 *
 * `onLeave` (optional) runs once the guard has actually cleared, right
 * before navigating — for cleanup that must NOT happen if the user chose to
 * stay (e.g. clearing a local draft only once the exit is truly confirmed).
 */
export function useBack(fallback: string | (() => void), onLeave?: () => void): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    void (async () => {
      if (!(await confirmLeave())) return;
      onLeave?.();
      if (location.key !== 'default') {
        navigate(-1);
        return;
      }
      if (typeof fallback === 'function') fallback();
      else navigate(fallback, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navigate, fallback, onLeave]);
}
