import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { coachUnreadCount } from '@/services/platform/messagesApi';

/**
 * Total unread client messages for the signed-in coach (0 for everyone else).
 * Drives the badge on the coach's Messages tab. Polls every 45s and refetches
 * on focus; the count drops as the coach opens threads (markThreadSeen).
 */
export function useCoachMessageUnread(): number {
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && role === 'coach' && !!uid && uid !== 'local-user';
  const q = useQuery({
    queryKey: ['coachMsgUnread', uid],
    queryFn: () => coachUnreadCount(uid),
    enabled,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  return q.data ?? 0;
}
