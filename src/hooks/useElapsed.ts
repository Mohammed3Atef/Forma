import { useEffect, useState } from 'react';

/**
 * Returns seconds elapsed since `startedAt` (epoch ms), ticking every second.
 * Pass null to pause. Computed from the timestamp so it stays correct after the
 * tab is backgrounded or the app restarts.
 */
export function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(() =>
    startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
  );

  useEffect(() => {
    if (startedAt == null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
