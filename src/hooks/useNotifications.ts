import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { subscribeCoachNotifications, subscribeNotifications } from '@/services/platform/notificationsApi';
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
 *    cache key; the collection-group query is index-backed) — refetched on focus.
 *  - coach: coach-bound alerts across their clients + their OWN doc (plan
 *    decisions about themselves), live via Firestore `onSnapshot`.
 *  - everyone else: their own client-bound feed, live via `onSnapshot`.
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
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Coach / client personal feed — real-time.
  const [items, setItems] = useState<AppNotification[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  useEffect(() => {
    if (!enabled || isAdmin) {
      setItems([]);
      setPersonalLoading(false);
      return;
    }
    setPersonalLoading(true);
    const onItems = (next: AppNotification[]) => {
      setItems(next);
      setPersonalLoading(false);
    };
    const unsub = isCoach ? subscribeCoachNotifications(uid, onItems) : subscribeNotifications(uid, 'client', onItems);
    return unsub;
  }, [enabled, isAdmin, isCoach, uid]);

  const resolvedItems: AppNotification[] = isSuper ? (adminQ.data ?? []).map(planRequestToNotification) : items;
  const unread = resolvedItems.filter((n) => !n.seenAt).length;
  const loading = enabled && (isSuper ? adminQ.isLoading : !isAdmin && personalLoading);
  return { items: resolvedItems, unread, isCoach, isAdmin, loading, refetch: adminQ.refetch };
}
