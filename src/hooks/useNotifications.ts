import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { listCoachNotifications, listNotifications } from '@/services/platform/notificationsApi';
import { listPendingPlanChangeRequests } from '@/services/platform/coachPlanApi';
import type { AppNotification, CoachPlanChangeRequest } from '@/types';

/** Map a pending coach plan-change request to the notification shape the bell +
 *  feed render. Admins have no clientData notifications doc, so their actionable
 *  signal IS the set of outstanding requests (cleared when they resolve one). */
function planRequestToNotification(r: CoachPlanChangeRequest): AppNotification {
  return {
    id: r.coachId,
    clientId: r.coachId,
    forRole: 'coach',
    type: 'plan_change_requested',
    body: r.reason,
    route: `/admin/coaches/${r.coachId}`,
    seenAt: null, // pending == unhandled — always shows on the badge until resolved
    createdAt: r.requestedAt,
    createdBy: r.coachId,
    updatedAt: r.updatedAt,
  };
}

/**
 * The signed-in user's in-app notifications + unread count, routed by role:
 *  - super-admin: pending coach plan-change requests (shares the overview's
 *    cache key; the collection-group query is index-backed).
 *  - coach: coach-bound alerts across their clients + their OWN doc (plan
 *    decisions about themselves).
 *  - everyone else: their own client-bound feed.
 * Polls every 60s and refetches on window focus.
 */
export function useNotifications() {
  const role = useSession((s) => s.account?.role) ?? 'client';
  const uid = useSession((s) => s.uid) ?? '';
  const isCoach = role === 'coach';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isSuper = role === 'super_admin';
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';

  // Super-admin feed: outstanding plan requests (same key as the overview alert).
  const adminQ = useQuery({
    queryKey: ['planRequests', 'pending'],
    queryFn: listPendingPlanChangeRequests,
    enabled: enabled && isSuper,
    refetchInterval: 60_000,
    staleTime: 60_000,
  });
  // Coach / client personal feed.
  const personalQ = useQuery({
    queryKey: ['notifications', uid, role],
    queryFn: () => (isCoach ? listCoachNotifications(uid) : listNotifications(uid, 'client')),
    enabled: enabled && !isAdmin,
    refetchInterval: 60_000,
  });

  const items: AppNotification[] = isSuper
    ? (adminQ.data ?? []).map(planRequestToNotification)
    : personalQ.data ?? [];
  const unread = items.filter((n) => !n.seenAt).length;
  const loading = enabled && (isSuper ? adminQ.isLoading : !isAdmin && personalQ.isLoading);
  return { items, unread, isCoach, isAdmin, loading, refetch: isSuper ? adminQ.refetch : personalQ.refetch };
}
