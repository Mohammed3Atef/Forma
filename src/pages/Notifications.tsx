import { useMemo, useState } from 'react';
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
import { markAllNotificationsSeen, markMessageNotificationsSeen, markNotificationSeen } from '@/services/platform/notificationsApi';
import { listMyClients } from '@/services/platform/coachApi';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { openNotification } from '@/lib/notificationTarget';
import { coalesceFeed, type FeedRow } from '@/lib/notificationTaxonomy';
import { useBack } from '@/hooks/useBack';
import type { AppNotification, NotificationType } from '@/types';
import { formatRelative } from '@/lib/format';

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

/** "5 minutes ago" / "yesterday" / "8 Oct" in the app language (B1.8 formatting service). */
function relativeTime(ms: number, lang: string): string {
  return formatRelative(ms, lang);
}

export function Notifications() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { items, isCoach, isAdmin, loading, error, retry } = useNotifications();
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllFailed, setMarkAllFailed] = useState(false);
  const markAll = async () => {
    setMarkingAll(true);
    setMarkAllFailed(false);
    try {
      await markAllNotificationsSeen();
      retry(); // re-poll now so the badge and rows update immediately
    } catch {
      setMarkAllFailed(true);
    } finally {
      setMarkingAll(false);
    }
  };
  const goBack = useBack(() => navigate(isAdmin ? '/admin' : isCoach ? '/coach' : '/'));
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);

  // Sender-name sources: a coach resolves clients by id; a client resolves their
  // one coach. (Admins only see plan-request items, which carry no sender.)
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

  // Grouped by the notification taxonomy (B1.9): a chatty thread is one row
  // (newest kept); everything else stays its own row.
  const rows = useMemo<FeedRow[]>(() => coalesceFeed(items), [items]);
  const anyUnseen = rows.some((r) => r.unseen);

  const pg = usePagination(rows, 15);

  const open = async (row: FeedRow) => {
    const n = row.rep;
    // Admin items are pending plan requests (no stored doc, no seen-state): just
    // deep-link to the coach so the super-admin can review/resolve.
    if (isAdmin) {
      navigate(openNotification(n, 'admin'));
      return;
    }
    const viewer = isCoach ? 'coach' : 'client';
    if (n.type === 'message_received') {
      // Clear every message notification for this thread/audience at once.
      void markMessageNotificationsSeen(n.clientId, viewer);
    } else if (!n.seenAt) await markNotificationSeen(n.clientId, n.id).catch(() => undefined);
    navigate(openNotification(n, viewer));
  };

  return (
    <div className="anim-rise space-y-3">
      <TopBar
        title={t('notifications.title')}
        eyebrow={t('app.name')}
        onBack={goBack}
        right={
          !isAdmin && anyUnseen ? (
            <button type="button" className="btn-ghost btn-sm shrink-0" data-testid="notifications-mark-all" disabled={markingAll} onClick={() => void markAll()}>
              {t('trust.notifications.markAll')}
            </button>
          ) : undefined
        }
      />
      {markAllFailed && (
        <p className="text-sm text-danger" role="alert">
          {t('trust.notifications.markAllFailed')}
        </p>
      )}

      {error ? (
        <div className="card space-y-2 text-center" role="alert" data-testid="notifications-error">
          <p className="text-sm text-danger">{t('trust.notifications.loadFailed')}</p>
          <button type="button" className="btn-ghost w-full" onClick={retry}>
            {t('common.retry')}
          </button>
        </div>
      ) : loading ? (
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
                      {n.resolvedAt && !isMsg && (
                        <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-success" data-testid="notification-done">
                          {t('trust.notifications.done')}
                        </span>
                      )}
                    </span>
                    {who && <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-earth-subtle">{typeLabel}</span>}
                    {n.body && <span className="mt-0.5 block truncate text-[13px] text-earth-muted">{n.body}</span>}
                    <span className="mt-0.5 block font-mono text-[10.5px] text-earth-subtle">{relativeTime(n.createdAt, i18n.language)}</span>
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
