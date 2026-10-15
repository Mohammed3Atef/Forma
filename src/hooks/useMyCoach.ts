import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';

/** The signed-in client's assigned coach (one `['myCoach', coachId]` cache entry for every client screen). */
export function useMyCoach() {
  const coachId = useSession((s) => s.account?.assignedCoachId) ?? null;
  const q = useQuery({
    queryKey: ['myCoach', coachId],
    queryFn: () => fetchMyCoach(coachId!),
    enabled: !!coachId,
  });
  const coach = q.data ?? null;
  return { coachId, coach, name: coach?.displayName || coach?.email || '', photoUrl: coach?.photoUrl, loading: !!coachId && q.isLoading };
}
