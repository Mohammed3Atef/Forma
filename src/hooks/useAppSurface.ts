import { useEffect } from 'react';

/**
 * Marks the document as the signed-in app (B3.9, VS-04) — as opposed to the website and the auth
 * pages — so app-only CSS (the 12 px type floor on shared classes the website also uses) reaches
 * sheets and dialogs rendered in portals too. Mounted by every app shell.
 */
export function useAppSurface() {
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.surface = 'app';
    return () => {
      delete el.dataset.surface;
    };
  }, []);
}
