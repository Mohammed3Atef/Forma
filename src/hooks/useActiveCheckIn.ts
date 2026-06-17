import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { getActiveCheckIn } from '@/services/platform/checkInApi';

/**
 * The signed-in client's most recent weekly check-in (for the Home card). The
 * card shows when `status === 'requested'`. Disabled in local-only mode / for
 * non-clients. Polls on focus so a coach's request appears promptly.
 */
export function useActiveCheckIn() {
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const q = useQuery({
    queryKey: ['activeCheckIn', uid],
    queryFn: () => getActiveCheckIn(uid),
    enabled,
    refetchInterval: 60_000,
  });
  return { checkIn: q.data ?? null, loading: enabled && q.isLoading };
}
