import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoachNotes, fetchMyCoachTargets, fetchMyPlans } from '@/services/platform/clientCoachApi';

/**
 * Coach-authored content for the signed-in client (notes, assigned plans,
 * targets). Disabled in local-only mode / when signed out, so the client app
 * stays fully functional offline.
 */
export function useCoachContent() {
  const uid = useSession((s) => s.uid);
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const cid = uid ?? '';

  const notes = useQuery({ queryKey: ['myCoachNotes', cid], queryFn: () => fetchMyCoachNotes(cid), enabled });
  const wPlans = useQuery({ queryKey: ['myPlans', cid, 'workout'], queryFn: () => fetchMyPlans(cid, 'workout'), enabled });
  const nPlans = useQuery({ queryKey: ['myPlans', cid, 'nutrition'], queryFn: () => fetchMyPlans(cid, 'nutrition'), enabled });
  const targets = useQuery({ queryKey: ['myCoachTargets', cid], queryFn: () => fetchMyCoachTargets(cid), enabled });

  const plans = [...(wPlans.data ?? []), ...(nPlans.data ?? [])];
  const hasContent = enabled && ((notes.data?.length ?? 0) > 0 || plans.length > 0 || !!targets.data);

  return { enabled, notes: notes.data ?? [], plans, targets: targets.data ?? null, hasContent };
}
