import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserRecord } from '@/types';
import { useSession } from '@/services/auth/sessionStore';
import { clientWeightLogsQuery, fetchClientProfile, getClientAssessment } from '@/services/platform/coachApi';
import { fetchUser } from '@/services/platform/accountsApi';
import { getRelationship } from '@/services/platform/coachClientsApi';
import { effectiveSubscriptionStatus, subscriptionDaysLeft } from '@/lib/subscription';


/**
 * The real data behind the coach client workspace's pinned header (and
 * anywhere else a compact client identity summary is needed): name, photo,
 * goal, and subscription status/days-left. Reuses the exact same query keys
 * `CoachClientDetail`/`CoachClients` already fetch with, so mounting this
 * alongside them is a cache hit, not a duplicate network call.
 */
export function useCoachClientHeader(clientId: string) {
  const coachId = useSession((s) => s.account?.id) ?? '';
  const qc = useQueryClient();
  // B3.9 (PF-07): the roster Today / Clients already hold carries this client's public record — start
  // from it (no second request while it is fresh); the dedicated read still runs once it goes stale.
  const fromRoster = () => qc.getQueryData<UserRecord[]>(['myClients', coachId])?.find((u) => u.id === clientId);
  const user = useQuery({
    queryKey: ['user', clientId],
    queryFn: () => fetchUser(clientId),
    enabled: !!clientId,
    initialData: fromRoster,
    initialDataUpdatedAt: () => qc.getQueryState(['myClients', coachId])?.dataUpdatedAt,
    staleTime: 30_000,
  });
  const profile = useQuery({ queryKey: ['clientProfile', clientId], queryFn: () => fetchClientProfile(clientId), enabled: !!clientId });
  const assessment = useQuery({ queryKey: ['clientAssessment', clientId], queryFn: () => getClientAssessment(clientId), enabled: !!clientId });
  const rel = useQuery({ queryKey: ['relationship', coachId, clientId], queryFn: () => getRelationship(coachId, clientId), enabled: !!coachId && !!clientId });
  // B3.9 (PF-07): the one weight-log entry the workspace shares (header, Summary, Progress › Body).
  const weight = useQuery(clientWeightLogsQuery(clientId));

  const name = assessment.data?.basic?.fullName?.trim() || user.data?.displayName || user.data?.email || '';
  const sub = rel.data?.subscription;
  const subStatus = effectiveSubscriptionStatus(sub);
  const daysLeft = sub ? subscriptionDaysLeft(sub) : null;
  const currentWeightKg = weight.data?.[0]?.weightKg ?? assessment.data?.basic?.weightKg ?? null;

  return {
    name,
    photoUrl: user.data?.photoUrl,
    goal: profile.data?.goal,
    subStatus,
    daysLeft,
    assessment: assessment.data ?? null,
    currentWeightKg,
    isLoading: user.isLoading || assessment.isLoading,
    // B3.4 workspace header: the client's account (blocking states, contact) and this coach's relationship.
    user: user.data ?? null,
    relationship: rel.data ?? null,
    relationshipState: rel.isError ? ('error' as const) : rel.isPending ? ('loading' as const) : ('ready' as const),
  };
}
