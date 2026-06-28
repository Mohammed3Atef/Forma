import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useNotifications } from '@/hooks/useNotifications';
import { useSession } from '@/services/auth/sessionStore';
import { markMessageNotificationsSeen, markNotificationSeen } from '@/services/platform/notificationsApi';
import { listMyClients } from '@/services/platform/coachApi';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { cloudAvailable } from '@/data/dataSource';
import { clientNoteRoute } from '@/lib/noteTarget';
import type { AppNotification, NotificationType } from '@/types';

const ICON: Record<NotificationType, IconName> = {
  coach_note: 'edit',
  plan_assigned: 'list',
  targets_updated: 'target',
  subscription_updated: 'calendar',
  freeze_decided: 'info',
  measurement_added: 'ruler',
  assessment_reviewed: 'check',
  freeze_requested: 'info',
  assessment_submitted: 'list',
  checkin_requested: 'calendar',
  checkin_submitted: 'calendar',
  checkin_reviewed: 'check',
  message_received: 'chat',
  trial_expiring: 'timer',
  plan_change_requested: 'bolt',
  plan_decided: 'check',
  coach_assigned: 'check',
  client_released: 'info',
};

/** A feed row: a single notification, or a collapsed group of messages from one
 *  thread (latest shown, `unreadCount` = how many unread messages from them). */
interface FeedRow {
  rep: AppNotification; // the representative (newest) notification
  count: number;
  unseen: boolean;
  unreadCount: number;
}

function relativeTime(ms: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return t('notifications.justNow');
  if (m < 60) return t('notifications.minutesAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('notifications.hoursAgo', { n: h });
  return new Date(ms).toLocaleDateString();
}

export function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, isCoach, isAdmin, loading } = useNotifications();
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);

  // Sender-name sources: a coach resolves clients by id; a client resolves their
  // one coach. (Admins only see plan-request items, which carry no sender.)
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
    const m = new Map<string, { name: string; photoUrl?: string }>();
    for (const c of clientsQ.data ?? []) m.set(c.id, { name: c.displayName || c.email, photoUrl: c.photoUrl });
    return m;
  }, [clientsQ.data]);

  // Who a notification is "from": a coach sees the client it concerns (keyed by
  // clientId); a client sees their coach. Returns null when there's no resolvable
  // person (admin plan-requests, the coach's own/system-addressed doc, or a
  // released client) — those fall back to the type icon.
  const sender = (n: AppNotification): { name: string; photoUrl?: string } | null => {
    if (isAdmin) return null;
    if (isCoach) {
      if (n.clientId === uid) return null; // self / system-addressed
      return clientInfo.get(n.clientId) ?? null;
    }
    return { name: coachQ.data?.displayName || coachQ.data?.email || t('coachInfo.yourCoach'), photoUrl: coachQ.data?.photoUrl };
  };

  // Collapse message notifications by thread (newest kept) so a chatty client
  // doesn't flood the feed; everything else stays as its own row. `items` are
  // newest-first, so the first message seen per thread is the one we show.
  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];
    const threadIdx = new Map<string, number>();
    for (const n of items) {
      const unread = n.seenAt ? 0 : 1;
      if (n.type === 'message_received') {
        const idx = threadIdx.get(n.clientId);
        if (idx == null) {
          threadIdx.set(n.clientId, out.length);
          out.push({ rep: n, count: 1, unseen: !n.seenAt, unreadCount: unread });
        } else {
          out[idx].count += 1;
          out[idx].unreadCount += unread;
          out[idx].unseen = out[idx].unseen || !n.seenAt;
        }
      } else {
        out.push({ rep: n, count: 1, unseen: !n.seenAt, unreadCount: unread });
      }
    }
    return out;
  }, [items]);

  const pg = usePagination(rows, 15);

  const open = async (row: FeedRow) => {
    const n = row.rep;
    // Admin items are pending plan requests (no stored doc, no seen-state): just
    // deep-link to the coach so the super-admin can review/resolve.
    if (isAdmin) {
      navigate(n.route ?? '/admin');
      return;
    }
    if (n.type === 'message_received') {
      // Clear every message notification for this thread/audience at once.
      void markMessageNotificationsSeen(n.clientId, isCoach ? 'coach' : 'client');
      navigate(isCoach ? n.route ?? '/coach' : clientNoteRoute(n));
      return;
    }
    if (!n.seenAt) await markNotificationSeen(n.clientId, n.id).catch(() => undefined);
    if (isCoach) {
      navigate(n.route ?? '/coach');
      return;
    }
    navigate(clientNoteRoute(n));
  };

  return (
    <div className="anim-rise space-y-3">
      <TopBar title={t('notifications.title')} eyebrow={t('app.name')} onBack={() => navigate(isAdmin ? '/admin' : isCoach ? '/coach' : '/')} />

      {loading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('notifications.empty')}</p>
      ) : (
        <>
          <div className="card divide-y divide-line-soft p-0">
            {pg.pageItems.map((row) => {
              const n = row.rep;
              const isMsg = n.type === 'message_received';
              const who = sender(n);
              const typeLabel = t(`notifications.types.${n.type}`);
              const title = who ? who.name : typeLabel;
              return (
                <button
                  key={n.id}
                  type="button"
                  data-testid="notification-item"
                  onClick={() => void open(row)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-start ${row.unseen ? 'bg-brand/5' : ''}`}
                >
                  {who ? (
                    <Avatar name={who.name} photoUrl={who.photoUrl} size="sm" className="mt-0.5 shrink-0" />
                  ) : (
                    <span className="row-av mt-0.5 h-9 w-9 shrink-0 bg-brand/15 text-brand">
                      <Icon name={ICON[n.type] ?? 'info'} size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{title}</span>
                      {isMsg && row.unreadCount > 0 && (
                        <span
                          data-testid="notification-count"
                          className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand"
                        >
                          +{row.unreadCount}
                        </span>
                      )}
                      {row.unseen && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                    </span>
                    {who && <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-earth-subtle">{typeLabel}</span>}
                    {n.body && <span className="mt-0.5 block truncate text-[13px] text-earth-muted">{n.body}</span>}
                    <span className="mt-0.5 block font-mono text-[10.5px] text-earth-subtle">{relativeTime(n.createdAt, t)}</span>
                  </span>
                  <Icon name="chevron" size={16} className="mt-1 text-earth-subtle" />
                </button>
              );
            })}
          </div>
          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
        </>
      )}
    </div>
  );
}
