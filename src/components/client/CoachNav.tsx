import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '@/components/ui/Button';
import { useClientMessageUnread } from '@/hooks/useClientMessageUnread';
import { useNotifications } from '@/hooks/useNotifications';
import { Avatar } from '@/components/Avatar';
import { useMyCoach } from '@/hooks/useMyCoach';

/**
 * The Coach tab's three sections (B2.6): Chat · Updates · Check-ins. These are
 * links (each has its own URL, so deep links and Back keep working), drawn as
 * a segmented control. Counts reuse what the shell already polls — no new
 * requests (47-console polling budget).
 */
export function CoachNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const messagesUnread = useClientMessageUnread();
  const { unread: updatesUnread } = useNotifications();
  const items = [
    { key: 'chat', to: '/messages', label: t('coachTab.chat'), badge: messagesUnread, on: pathname === '/messages' },
    { key: 'updates', to: '/coach-notes', label: t('coachTab.updates'), badge: updatesUnread, on: pathname === '/coach-notes' },
    { key: 'checkins', to: '/check-ins', label: t('coachTab.checkins'), badge: 0, on: pathname === '/check-ins' },
  ];
  return (
    <nav aria-label={t('coachTab.label')} className="seg seg-quiet" data-testid="coach-nav">
      {items.map((it) => (
        <Link
          key={it.key}
          to={it.to}
          replace
          aria-current={it.on ? 'page' : undefined}
          data-testid={`coach-nav-${it.key}`}
          className={`${it.on ? 'on' : ''} inline-flex items-center justify-center gap-1.5`}
        >
          {it.label}
          {it.badge > 0 && (
            <>
              <span aria-hidden="true">
                <CountBadge count={it.badge} testId={`coach-nav-${it.key}-badge`} />
              </span>
              <span className="sr-only">{t('coachTab.unread', { count: it.badge })}</span>
            </>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Header title on the Coach tab: who the client is talking to. */
export function CoachIdentity() {
  const { t } = useTranslation();
  const { coachId, name, photoUrl } = useMyCoach();
  if (!coachId) return <>{t('nav.coach')}</>;
  return (
    <span className="flex min-w-0 items-center gap-2.5" data-testid="coach-identity">
      <Avatar name={name || t('coachInfo.yourCoach')} photoUrl={photoUrl} size="sm" rounded="rounded-full" />
      <span className="min-w-0 text-start">
        <span className="block truncate text-[15px] font-semibold leading-tight">{name || t('coachInfo.yourCoach')}</span>
        <span className="block text-[12px] font-normal leading-tight text-earth-muted">{t('coachInfo.yourCoach')}</span>
      </span>
    </span>
  );
}
