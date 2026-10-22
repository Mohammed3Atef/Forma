import { createContext, useContext, useEffect } from 'react';

/**
 * B3.9 (VS-05): Library shows one orange primary. While the first-run starter panel is on screen its
 * "Add the starter library" is the primary, so the header's "New …" steps down to secondary. The
 * panel reports itself here (it lives deep inside a segment; this avoids an import cycle).
 */
export const StarterShownContext = createContext<(shown: boolean) => void>(() => {});

/** Called by the starter panel: shown while mounted. */
export function useReportStarterShown() {
  const report = useContext(StarterShownContext);
  useEffect(() => {
    report(true);
    return () => report(false);
  }, [report]);
}
