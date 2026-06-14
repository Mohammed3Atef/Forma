import { useEffect, useRef } from 'react';
import { useSettings } from '@/stores/settingsStore';

/**
 * Holds a screen Wake Lock while `active` is true, preventing the screen from
 * sleeping during a workout/timer. Re-acquires on tab refocus (the lock is
 * released by the browser when the page is hidden). No-op where unsupported.
 */
export function useWakeLock(active: boolean): void {
  const enabled = useSettings((s) => s.settings?.keepAwakeDuringWorkout ?? true);
  const sentinel = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !enabled) return;
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel.current = lock;
      } catch {
        /* user agent may reject (low battery, no gesture) — ignore */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel.current?.release().catch(() => undefined);
      sentinel.current = null;
    };
  }, [active, enabled]);
}
