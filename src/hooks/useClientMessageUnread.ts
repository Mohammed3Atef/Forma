import { useEffect, useState } from 'react';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { subscribeThreadMeta } from '@/services/platform/messagesApi';

/**
 * Total unread coach→client messages for the signed-in client (0 for everyone
 * else), live via the same polling thread-meta subscription the inbox rows
 * use. Drives the badge on the client's Inbox tab / nav entry.
 */
export function useClientMessageUnread(): number {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && role === 'client' && !!uid && uid !== 'local-user';
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    return subscribeThreadMeta(uid, (meta) => setCount(meta.unreadForClient));
  }, [enabled, uid]);
  return count;
}
