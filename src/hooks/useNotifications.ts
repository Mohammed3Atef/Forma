import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { listCoachNotifications, listNotifications } from '@/services/platform/notificationsApi';

/**
 * The signed-in user's in-app notifications + unread count. A coach aggregates
 * coach-bound notifications across their clients; everyone else reads their own
 * client-bound feed. Polls every 60s and refetches on window focus.
 */
export function useNotifications() {
  const role = useSession((s) => s.account?.role) ?? 'client';
  const uid = useSession((s) => s.uid) ?? '';
  const isCoach = role === 'coach';
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';

  const q = useQuery({
    queryKey: ['notifications', uid, role],
    queryFn: () => (isCoach ? listCoachNotifications(uid) : listNotifications(uid, 'client')),
    enabled,
    refetchInterval: 60_000,
  });

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.seenAt).length;
  return { items, unread, isCoach, loading: enabled && q.isLoading, refetch: q.refetch };
}
