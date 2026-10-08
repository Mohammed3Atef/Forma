import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/services/auth/sessionStore';
import { refreshNotifications, subscribeCoachNotifications, subscribeNotifications } from '@/services/platform/notificationsApi';
import { listPendingPlanRequests } from '@/services/platform/coachPlanRequestsApi';
import type { AppNotification, CoachPlanRequest } from '@/types';

/** Map a pending coach plan request to the notification shape the bell + feed
 *  render. Admins have no clientData notifications doc, so their actionable
 *  signal IS the set of outstanding requests (cleared when they resolve one).
 *  Uses the request's own `id` (not `coachId`) for notification identity —
 *  unlike the old singleton-per-coach model, a coach can have several
 *  historical requests, so `route` (not `id`) is what still targets the coach. */
function planRequestToNotification(r: CoachPlanRequest): AppNotification {
  return {
    id: r.id,
    clientId: r.coachId,
    forRole: 'coach',
    type: 'plan_change_requested',
    body: r.capacitySnapshot ? `+${r.capacitySnapshot.additionalClients} · ${r.capacitySnapshot.price} ${r.capacitySnapshot.currency}` : r.planSnapshot ? `${r.planSnapshot.priceMonthly} ${r.planSnapshot.currency}` : r.reason,
    route: '/admin/plans?tab=requests',
    seenAt: null, // pending == unhandled — always shows on the badge until resolved
    createdAt: r.requestedAt,
    createdBy: r.coachId,
    updatedAt: r.requestedAt, // CoachPlanRequest has no updatedAt of its own — requestedAt is its only timestamp until resolved
  };
}

/**
 * The signed-in user's in-app notifications + unread count, routed by role:
 *  - super-admin: pending coach plan-change requests (shares the overview's
 *    cache key; the collection-group query is index-backed) — refetched on focus.
 *  - coach: coach-bound alerts across their clients + their OWN doc (plan
 *    decisions about themselves), via ONE shared poll of `notifications.list`.
 *  - everyone else: their own client-bound feed, same shared poll (not realtime).
 */
export function useNotifications() {
  const role = useSession((s) => s.account?.role) ?? 'client';
  const uid = useSession((s) => s.uid) ?? '';
  const isCoach = role === 'coach';
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isSuper = role === 'super_admin';
  const enabled = !!uid;

  // Super-admin feed: outstanding plan requests (same key as the overview alert).
  const adminQ = useQuery({
    queryKey: ['planRequests', 'pending'],
    queryFn: listPendingPlanRequests,
    enabled: enabled && isSuper,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Coach / client personal feed — real-time.
  const [items, setItems] = useState<AppNotification[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled || isAdmin) {
      setItems([]);
      setPersonalLoading(false);
      return;
    }
    setPersonalLoading(true);
    setFailed(false);
    const onItems = (next: AppNotification[]) => {
      setItems(next);
      setPersonalLoading(false);
    };
    const unsub = isCoach ? subscribeCoachNotifications(uid, onItems, 50, setFailed) : subscribeNotifications(uid, 'client', onItems, 50, setFailed);
    return unsub;
  }, [enabled, isAdmin, isCoach, uid, nonce]);

  const resolvedItems: AppNotification[] = isSuper ? (adminQ.data ?? []).map(planRequestToNotification) : items;
  const unread = resolvedItems.filter((n) => !n.seenAt).length;
  const loading = enabled && (isSuper ? adminQ.isLoading : !isAdmin && personalLoading);
  // `error` only while nothing has loaded yet (a later failed poll keeps the last good feed).
  const error = isSuper ? adminQ.isError && !adminQ.data : failed && personalLoading;
  const retry = () => {
    if (isSuper) return void adminQ.refetch();
    refreshNotifications(); // the shared poller (other bells keep it alive)
    setNonce((n) => n + 1);
  };
  return { items: resolvedItems, unread, isCoach, isAdmin, loading: loading && !error, error, retry, refetch: adminQ.refetch };
}
