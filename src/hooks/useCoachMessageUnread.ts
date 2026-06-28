import { useEffect, useState } from 'react';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { subscribeCoachUnread } from '@/services/platform/messagesApi';

/**
 * Total unread client messages for the signed-in coach (0 for everyone else),
 * live via Firestore `onSnapshot`. Drives the badge on the coach's Messages tab;
 * the count rises the instant a client sends and drops the instant the coach
 * opens the thread (markThreadSeen).
 */
export function useCoachMessageUnread(): number {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && role === 'coach' && !!uid && uid !== 'local-user';
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
