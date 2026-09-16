import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/services/auth/sessionStore';
import { fetchClientProfile, getClientAssessment } from '@/services/platform/coachApi';
import { fetchUser } from '@/services/platform/accountsApi';
import { getRelationship } from '@/services/platform/coachClientsApi';
import { effectiveSubscriptionStatus, subscriptionDaysLeft } from '@/lib/subscription';
import type { PillTone } from '@/components/ui/Pill';

export const SUB_TONE: Record<string, PillTone> = {
  none: 'mute',
  trial: 'brand',
  active: 'ok',
  pending: 'warn',
  expired: 'bad',
  cancelled: 'bad',
  frozen: 'warn',
};

/**
 * The real data behind the coach client workspace's pinned header (and
 * anywhere else a compact client identity summary is needed): name, photo,
 * goal, and subscription status/days-left. Reuses the exact same query keys
 * `CoachClientDetail`/`CoachClients` already fetch with, so mounting this
 * alongside them is a cache hit, not a duplicate network call.
 */
export function useCoachClientHeader(clientId: string) {
  const coachId = useSession((s) => s.account?.id) ?? '';
  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const profile = useQuery({ queryKey: ['clientProfile', clientId], queryFn: () => fetchClientProfile(clientId), enabled: !!clientId });
  const assessment = useQuery({ queryKey: ['clientAssessment', clientId], queryFn: () => getClientAssessment(clientId), enabled: !!clientId });
  const rel = useQuery({ queryKey: ['relationship', coachId, clientId], queryFn: () => getRelationship(coachId, clientId), enabled: !!coachId && !!clientId });

  const name = assessment.data?.basic?.fullName?.trim() || user.data?.displayName || user.data?.email || '';
  const sub = rel.data?.subscription;
  const subStatus = effectiveSubscriptionStatus(sub);
  const daysLeft = sub ? subscriptionDaysLeft(sub) : null;

  return {
    name,
    photoUrl: user.data?.photoUrl,
    goal: profile.data?.goal,
    subStatus,
    daysLeft,
    isLoading: user.isLoading || assessment.isLoading,
  };
}
