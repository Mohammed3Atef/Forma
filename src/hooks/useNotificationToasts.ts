import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useGuardedNav } from '@/hooks/useGuardedNav';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { useNotifications } from '@/hooks/useNotifications';
import { markNotificationSeen } from '@/services/platform/notificationsApi';
import { listMyClients } from '@/services/platform/coachApi';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { showToast, type ToastAvatar } from '@/stores/toastStore';
import { openNotification } from '@/lib/notificationTarget';
import { pickToastable } from '@/lib/notificationBaseline';
import type { AppNotification } from '@/types';

/**
 * Toasts for notifications that JUST arrived (B0 / NT-01, NT-02) — moved out of
 * the bell (B2) so a shell without a bell (the client app) keeps them. Mount it
 * once per shell; toasts are keyed by id, so two mounts can't double-toast.
 * Returns the feed it read, for a bell that also shows the badge.
 */
export function useNotificationToasts() {
  const { t } = useTranslation();
  // A toast tap is a navigation like any other: through the unsaved-changes guard (NAV-K05).
  const navigate = useGuardedNav();
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const { items, unread, loading } = useNotifications();
  const location = useLocation();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isCoach = role === 'coach';

  // Sender resolution for "new message" toasts (name + avatar): a coach resolves
  // clients by id, a client resolves their one coach. Cached + shared keys, so
  // these add no real cost over what the Clients/Messages pages already fetch.
  const clientsQ = useQuery({
    queryKey: ['myClients', uid],
    queryFn: () => listMyClients(uid),
    enabled: isCoach && !!uid,
  });
  const coachQ = useQuery({
    queryKey: ['myCoach', coachId],
    queryFn: () => fetchMyCoach(coachId!),
    enabled: !isCoach && !isAdmin && !!coachId,
  });
  const clientInfo = useMemo(() => {
    const m = new Map<string, ToastAvatar>();
    for (const c of clientsQ.data ?? []) m.set(c.id, { name: c.displayName || c.email, photoUrl: c.photoUrl });
    return m;
  }, [clientsQ.data]);
  const senderOf = (n: AppNotification): ToastAvatar | null => {
    if (isAdmin) return null;
    if (isCoach) {
      if (n.clientId === uid) return null; // self / system-addressed
      return clientInfo.get(n.clientId) ?? null;
    }
    return { name: coachQ.data?.displayName || coachQ.data?.email || t('coachInfo.yourCoach'), photoUrl: coachQ.data?.photoUrl };
  };

  // Pop a toast only for what JUST arrived — never the backlog (B0 / NT-01):
  // "new" is judged against a per-user mark stored on the device (survives
  // reloads, relaunches and update reloads) plus a short recency window. Toasts
  // are deduped by id, so the two mounted bells (mobile + desktop chrome)
  // can't double-toast. Building a toast has no side effects (NT-02).
  useEffect(() => {
    if (loading || !uid) return;
    const fresh = pickToastable(uid, items).filter((n) => {
      // Never toast a message for the thread that's already on screen.
      if (n.type !== 'message_received') return true;
      return isCoach ? location.pathname !== `/coach/messages/${n.clientId}` : location.pathname !== '/messages';
    });
    if (fresh.length === 0) return;
    [...fresh].reverse().forEach((n) => {
      const who = senderOf(n) ?? undefined;
      const typeLabel = t(`notifications.types.${n.type}`);
      const isMsg = n.type === 'message_received';
      showToast({
        key: n.id,
        // With a sender, the name is the title and the type/preview is the body
        // ("Dodo" · "Assessment submitted"); otherwise the type is the title.
        title: who ? who.name : typeLabel,
        body: who && !isMsg ? (n.body ? `${typeLabel} · ${n.body}` : typeLabel) : n.body,
        variant: 'info',
        avatar: who,
        onClick: () => {
          if (!isAdmin && !n.seenAt) void markNotificationSeen(n.clientId, n.id).catch(() => undefined);
          // Only a TAP may move the client's day / focus (B0 / NT-02).
          navigate(openNotification(n, isCoach ? 'coach' : isAdmin ? 'admin' : 'client'));
        },
      });
    });
    // senderOf reads clientInfo/coachQ; intentionally not deps (best-effort name).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading, uid, isAdmin, isCoach, navigate, t, location.pathname]);
  return { items, unread, loading, isAdmin, isCoach };
}
