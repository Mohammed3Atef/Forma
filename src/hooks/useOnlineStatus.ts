import { useEffect, useState } from 'react';

/**
 * Single source of truth for connectivity. Subscribes to the browser
 * `online`/`offline` events and seeds from `navigator.onLine`. Use this instead
 * of reading `navigator.onLine` directly so offline UI/gating stays consistent.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
