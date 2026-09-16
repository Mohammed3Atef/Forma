import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUser } from '@/services/platform/accountsApi';
import { CoachSubscriptionPanel } from '@/pages/coach/CoachSubscriptionPanel';

/**
 * The workspace's `subscription` tab — the same subscription/account-status
 * panel that used to live inline inside `CoachClientDetail`'s overview, now
 * given its own tab (matches the design's dedicated `subscription` tab).
 */
export function CoachClientSubscriptionTab() {
  const { clientId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });

  return <CoachSubscriptionPanel clientId={clientId} coachId={coachId} account={user.data ?? null} />;
}
