import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Pagination } from '@/components/ui/Pagination';
import { IconTile, ListGroup, Section } from '@/components/ui/ListRow';
import { CoachNav } from '@/components/client/CoachNav';
import { usePagination } from '@/hooks/usePagination';
import { useNotifications } from '@/hooks/useNotifications';
import { useCoachContent } from '@/hooks/useCoachContent';
import { markAllNotificationsSeen, markNotificationSeen } from '@/services/platform/notificationsApi';
import { openNotification } from '@/lib/notificationTarget';
import { openClientNote } from '@/lib/noteTarget';
import { coalesceFeed, kindOf, type FeedRow } from '@/lib/notificationTaxonomy';
import { mergeUpdates } from '@/lib/coachUpdates';
import { formatRelative } from '@/lib/format';
import type { CoachNote, NotificationType } from '@/types';

const ICON: Partial<Record<NotificationType, IconName>> = {
  coach_note: 'note',
  plan_assigned: 'list',
  targets_updated: 'target',
  subscription_updated: 'calendar',
  freeze_decided: 'info',
  measurement_added: 'ruler',
  assessment_reviewed: 'check',
  checkin_requested: 'calendar',
  checkin_reviewed: 'check',
};

/*
 * COACH › UPDATES (B2.6): one timeline of what the coach did — notes and
 * announcements (full text) and the other updates (plan, targets, check-in
 * requests and reviews, account). Same lifecycle as the old Notifications
 * page: unread, "Done" for completed tasks, mark all read, deep links.
 * Chat messages are not repeated here (Chat and its count own them). The
 * subscription block moved to You (RM-22); the targets grid lives on
 * Nutrition / Cardio.
 */
export function CoachUpdates() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { items: notifications, loading, error, retry } = useNotifications();
  const { notes } = useCoachContent();
  const [markingAll, setMarkingAll] = useState(false);
  const [markAllFailed, setMarkAllFailed] = useState(false);
  const [seenNow, setSeenNow] = useState<Set<string>>(() => new Set());

  const rows = useMemo<FeedRow[]>(() => coalesceFeed(notifications).filter((r) => kindOf(r.rep.type)?.category !== 'message'), [notifications]);
  const items = useMemo(() => mergeUpdates(rows, notes), [rows, notes]);
  const unseen = (row?: FeedRow) => !!row && row.unseen && !seenNow.has(row.rep.id);
  const anyUnseen = rows.some((r) => unseen(r));
  const pg = usePagination(items, 15);

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

  const markSeen = async (row?: FeedRow) => {
    if (!row || !unseen(row)) return;
    setSeenNow((s) => new Set(s).add(row.rep.id));
    await markNotificationSeen(row.rep.clientId, row.rep.id).catch(() => undefined);
  };

  const openRow = async (row: FeedRow) => {
    await markSeen(row);
    navigate(openNotification(row.rep, 'client'));
  };

  const openNote = async (note: CoachNote, row?: FeedRow) => {
    await markSeen(row);
    if (note.entityType && note.entityId) navigate(openClientNote(note));
  };

  const dot = <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label={t('coachTab.new')} />;

  return (
    <div className="space-y-7" data-testid="client-coach-updates">
      <CoachNav />

      <Section
        title={t('coachTab.latest')}
        testId="coach-updates-feed"
        action={
          anyUnseen ? (
            <Button variant="ghost" size="sm" pending={markingAll} onClick={() => void markAll()} data-testid="notifications-mark-all">
              {t('trust.notifications.markAll')}
            </Button>
          ) : undefined
        }
      >
        {markAllFailed && (
          <p className="mb-2 text-[14px] text-warn" role="alert">
            {t('trust.notifications.markAllFailed')}
          </p>
        )}
        {error && notes.length === 0 ? (
          <ErrorState message={t('trust.notifications.loadFailed')} onRetry={retry} testId="notifications-error" />
        ) : loading && notes.length === 0 ? (
          <LoadingState variant="list" count={3} />
        ) : items.length === 0 ? (
          <p className="text-[15px] text-earth-muted">{t('coachTab.noUpdates')}</p>
        ) : (
          <>
            {error && (
              <p className="mb-2 text-[14px] text-warn" role="alert" data-testid="notifications-error">
                {t('trust.notifications.loadFailed')}
              </p>
            )}
            <ListGroup>
              {pg.pageItems.map((it) => {
                if (it.kind === 'note') {
                  const { note, row } = it;
                  const isNew = unseen(row);
                  const anchored = !!(note.entityType && note.entityId);
                  const announcement = note.kind === 'announcement';
                  const inner = (
                    <>
                      <IconTile icon={announcement ? 'star' : 'note'} tone={isNew ? 'brand' : 'neutral'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`text-[13px] font-semibold ${announcement ? 'text-brand-hover' : 'text-earth-muted'}`}>{announcement ? t('clientCoach.announcement') : t('coachTab.note')}</span>
                          {isNew && dot}
                        </span>
                        <span className="mt-0.5 block whitespace-pre-wrap text-[15px] leading-relaxed">{note.body}</span>
                        <span className="mt-1 block text-[12px] text-earth-subtle">{formatRelative(note.createdAt, lang)}</span>
                      </span>
                      {anchored && <Icon name="chevron" size={18} className="mt-1 shrink-0 text-earth-subtle" />}
                    </>
                  );
                  return anchored || isNew ? (
                    <button key={`n-${note.id}`} type="button" onClick={() => void openNote(note, row)} className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]" data-testid="coach-note-item" data-unseen={isNew || undefined}>
                      {inner}
                    </button>
                  ) : (
                    <div key={`n-${note.id}`} className="flex items-start gap-3 px-4 py-3" data-testid="coach-note-item">
                      {inner}
                    </div>
                  );
                }
                const { row } = it;
                const n = row.rep;
                const isNew = unseen(row);
                return (
                  <button
                    key={n.id}
                    type="button"
                    data-testid="notification-item"
                    data-unseen={isNew || undefined}
                    onClick={() => void openRow(row)}
                    className="flex min-h-14 w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-white/[0.03]"
                  >
                    <IconTile icon={ICON[n.type] ?? 'info'} tone={isNew ? 'brand' : 'neutral'} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={`truncate text-[15px] ${isNew ? 'font-semibold' : 'font-medium text-earth-muted'}`}>{t(`notifications.types.${n.type}`)}</span>
                        {isNew && dot}
                        {n.resolvedAt && (
                          <span className="shrink-0 rounded-ui-pill bg-success/15 px-2 py-0.5 text-[12px] font-semibold text-success" data-testid="notification-done">
                            {t('trust.notifications.done')}
                          </span>
                        )}
                      </span>
                      {n.body && <span className="mt-0.5 block truncate text-[14px] text-earth-muted">{n.body}</span>}
                      <span className="mt-0.5 block text-[12px] text-earth-subtle">{formatRelative(n.createdAt, lang)}</span>
                    </span>
                    <Icon name="chevron" size={18} className="mt-1 shrink-0 text-earth-subtle" />
                  </button>
                );
              })}
            </ListGroup>
            {pg.totalPages > 1 && (
              <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
            )}
          </>
        )}
      </Section>
    </div>
  );
}
