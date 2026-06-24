import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyRelationship } from '@/services/platform/clientCoachApi';
import { effectiveSubscriptionStatus, subscriptionAccess } from '@/lib/subscription';
import { setSubscriptionReadOnly } from '@/stores/subscriptionGate';

/**
 * The signed-in client's coaching subscription state (read from the coach⇄client
 * relationship). Disabled in local-only mode / for non-clients (no assigned
 * coach), where it reports `none` and never gates anything.
 */
export function useSubscription() {
  const uid = useSession((s) => s.uid);
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user' && !!coachId;
  const q = useQuery({
    queryKey: ['mySubscription', uid],
    queryFn: () => fetchMyRelationship(coachId!, uid!),
    enabled,
  });
  const sub = q.data?.subscription ?? null;
  const history = q.data?.subscriptionHistory ?? [];
  const status = effectiveSubscriptionStatus(sub);
  const access = subscriptionAccess(status);
  const readOnly = access === 'readonly';

  // Mirror into the synchronous gate so data stores can block plan logging.
  useEffect(() => {
    setSubscriptionReadOnly(readOnly);
  }, [readOnly]);

  return {
    sub,
    history,
    status,
    access,
    limited: access === 'limited',
    loading: enabled && q.isLoading,
    /** expired/cancelled/frozen/ended -> coach plans are view-only. */
    readOnly,
    ended: status === 'ended',
  };
}
