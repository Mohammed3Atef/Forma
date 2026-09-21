import { useCallback } from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { confirmLeave } from '@/stores/navGuardStore';

/**
 * `useNavigate()`, but routed through the same unsaved-changes guard as
 * `useBack` — for navigation triggers that AREN'T a "back" action (the coach
 * workspace tab rail, the bottom nav), which otherwise bypass a dirty
 * editor's confirm entirely by pushing straight to a new route.
 */
export function useGuardedNav(): (to: To, options?: NavigateOptions) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: To, options?: NavigateOptions) => {
      void (async () => {
        if (await confirmLeave()) navigate(to, options);
      })();
    },
    [navigate],
  );
}
