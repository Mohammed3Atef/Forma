import { useEffect, useState } from 'react';
import { useSession } from '@/services/auth/sessionStore';
import { subscribeCoachUnread } from '@/services/platform/messagesApi';

/**
 * Total unread client messages for the signed-in coach (0 for everyone else),
 * via a shared poll of the thread summaries (not realtime — see messagesApi).
 * Drives the badge on the coach's Messages tab; it drops once the coach opens
 * the thread (markThreadSeen) and the next poll lands.
 */
export function useCoachMessageUnread(): number {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = role === 'coach' && !!uid;
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    return subscribeCoachUnread(uid, setCount);
  }, [enabled, uid]);
  return count;
}
