import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { confirmLeave } from '@/stores/navGuardStore';

/**
 * The one back-navigation rule for the whole app: prefer real browser/in-app
 * back (so the URL, scroll position, filters and query params the user
 * actually had are restored exactly), and only fall back to a fixed
 * destination when there's nothing to go back to — a direct URL entry, a
 * notification/deep-link open, or a refresh. "Nothing to go back to" is read
 * from react-router's own history index (`window.history.state.idx`, 0 for
 * the first entry of this document, +1 per push, unchanged by `replace`).
 * NOT from `location.key`: a `replace` navigation (the workspace tab rail,
 * `?tab=` syncs) assigns a fresh key to what is still the first entry, so a
 * key-based check would call `navigate(-1)` and leave the site.
 *
 * Always routes through `confirmLeave()` first, so a dirty editor's
 * unsaved-changes guard (see `useUnsavedGuard`) fires no matter which back
 * control — this one, a tab rail, or the bottom nav — triggered the exit.
 *
 * `onLeave` (optional) runs once the guard has actually cleared, right
 * before navigating — for cleanup that must NOT happen if the user chose to
 * stay (e.g. clearing a local draft only once the exit is truly confirmed).
 */
export function canGoBackInApp(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

export function useBack(fallback: string | (() => void), onLeave?: () => void): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(() => {
    void (async () => {
      if (!(await confirmLeave())) return;
      onLeave?.();
      if (canGoBackInApp()) {
        navigate(-1);
        return;
      }
      if (typeof fallback === 'function') fallback();
      else navigate(fallback, { replace: true });
    })();
    // `location.key` keeps the callback fresh per navigation (the idx is read at click time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navigate, fallback, onLeave]);
}
