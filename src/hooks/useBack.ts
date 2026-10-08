import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { confirmLeave } from '@/stores/navGuardStore';
import { useSession } from '@/services/auth/sessionStore';
import { isRolePath, roleSpaceOf, semanticParent, type RoleSpace } from '@/lib/navContract';

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
 *
 * With nothing to go back to, the destination is (B1.10 navigation contract):
 * a `?returnTo=` the link carried — only if it's one of this role's own
 * screens — else the caller's `fallback`, else the screen's semantic parent
 * (`lib/navContract`), so a cold deep link's Back always goes "up".
 */
export function canGoBackInApp(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === 'number' && idx > 0;
}

/** Where Back goes when there is no in-app history (see `useBack`). */
export function backTarget(location: { pathname: string; search: string }, space: RoleSpace, fallback?: string): string {
  const returnTo = new URLSearchParams(location.search).get('returnTo');
  if (isRolePath(returnTo, space) && returnTo.split(/[?#]/)[0] !== location.pathname) return returnTo;
  if (fallback && isRolePath(fallback, space)) return fallback;
  return semanticParent(location.pathname, space);
}

export function useBack(fallback?: string | (() => void), onLeave?: () => void): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useSession((s) => s.account?.role);
  return useCallback(() => {
    void (async () => {
      if (!(await confirmLeave())) return;
      onLeave?.();
      if (canGoBackInApp()) {
        navigate(-1);
        return;
      }
      if (typeof fallback === 'function') fallback();
      else navigate(backTarget(location, roleSpaceOf(role), fallback), { replace: true });
    })();
    // `location.key` keeps the callback fresh per navigation (the idx is read at click time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, navigate, fallback, onLeave, role]);
}
