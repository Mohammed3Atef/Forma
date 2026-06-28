import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { useNotifications } from '@/hooks/useNotifications';
import { markNotificationSeen } from '@/services/platform/notificationsApi';
import { listMyClients } from '@/services/platform/coachApi';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { showToast, type ToastAvatar } from '@/stores/toastStore';
import { cloudAvailable } from '@/data/dataSource';
import { clientNoteRoute } from '@/lib/noteTarget';
import type { AppNotification } from '@/types';
import { Icon } from './Icon';

/**
 * Notifications bell with an unread badge. Routes to the role-appropriate feed.
 * Positioned by the caller (wrap in an absolutely-placed span for the BrandBar,
 * or drop it in flow for the desktop top bar). The badge anchors to the button,
 * so the button is `relative`.
 */
export function NotificationBell({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useSession((s) => s.account?.role);
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const { items, unread } = useNotifications();
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isCoach = role === 'coach';
  const to = isCoach ? '/coach/notifications' : isAdmin ? '/admin/notifications' : '/notifications';

  // Sender resolution for "new message" toasts (name + avatar): a coach resolves
  // clients by id, a client resolves their one coach. Cached + shared keys, so
  // these add no real cost over what the Clients/Messages pages already fetch.
  const clientsQ = useQuery({
    queryKey: ['myClients', uid],
    queryFn: () => listMyClients(uid),
    enabled: cloudAvailable() && isCoach && !!uid,
  });
  const coachQ = useQuery({
    queryKey: ['myCoach', coachId],
    queryFn: () => fetchMyCoach(coachId!),
    enabled: cloudAvailable() && !isCoach && !isAdmin && !!coachId,
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

  // Pop a toast for notifications that arrive AFTER mount (never the backlog).
  // `items` are newest-first; the high-water mark is the newest createdAt seen
  // so far. Deduped by id in the toast store, so the two mounted bells (mobile +
  // desktop chrome) can't double-toast the same notification.
  const hwRef = useRef<number | null>(null);
  useEffect(() => {
    const newest = items[0]?.createdAt ?? 0;
    if (hwRef.current === null) {
      hwRef.current = newest; // first populated render → establish baseline
      return;
    }
    const fresh = items.filter((n) => !n.seenAt && n.createdAt > (hwRef.current ?? 0));
    if (fresh.length === 0) return;
    hwRef.current = Math.max(hwRef.current ?? 0, newest);
    // Oldest-first so the newest toast ends up at the bottom of the stack.
    [...fresh].reverse().forEach((n) => {
      const route = isCoach ? n.route ?? '/coach' : isAdmin ? n.route ?? '/admin' : clientNoteRoute(n);
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
          navigate(route);
        },
      });
    });
    // senderOf reads clientInfo/coachQ; intentionally not deps (best-effort name).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isAdmin, isCoach, navigate, t]);
  return (
    <button
      type="button"
      data-testid="notifications-bell"
      aria-label={t('notifications.title')}
      onClick={() => navigate(to)}
      className={`icon-btn relative flex h-10 w-10 items-center justify-center text-earth-muted ${className}`}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && (
        <span
          data-testid="notifications-badge"
          className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
