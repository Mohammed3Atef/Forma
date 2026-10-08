import { useEffect } from 'react';
import { useSession } from '@/services/auth/sessionStore';
import { recordActiveDay } from '@/services/platform/usageApi';
import { dayKeyOf } from '@/lib/format';

/**
 * Records "active today" for the signed-in user (once per calendar day, on
 * mount + app foreground) so the admin can compute DAU/WAU/MAU + last-active.
 * Best-effort; never blocks or throws. No-op for the synthetic local account.
 */
export function PresenceTracker() {
  const uid = useSession((s) => s.uid);
  const role = useSession((s) => s.account?.role);
  useEffect(() => {
    if (!uid || !role) return;
    const mark = () => {
      const key = `forma:active:${dayKeyOf(Date.now())}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, '1');
      } catch { /* storage blocked — still record */ }
      void recordActiveDay().catch(() => undefined);
    };
    mark();
    const onVis = () => { if (document.visibilityState === 'visible') mark(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [uid, role]);
  return null;
}
