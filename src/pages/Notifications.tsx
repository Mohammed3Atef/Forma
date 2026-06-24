import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon, type IconName } from '@/components/Icon';
import { useNotifications } from '@/hooks/useNotifications';
import { markNotificationSeen } from '@/services/platform/notificationsApi';
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
  message_received: 'info',
  trial_expiring: 'timer',
};

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
  const qc = useQueryClient();
  const { items, isCoach, loading } = useNotifications();

  const open = async (n: AppNotification) => {
    if (!n.seenAt) {
      await markNotificationSeen(n.clientId, n.id).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    // Coach notifications carry an explicit coach route; client ones resolve the
    // screen/day/entity (and arm scroll-to-highlight) via clientNoteRoute.
    if (isCoach) {
      navigate(n.route ?? '/coach');
      return;
    }
    navigate(clientNoteRoute(n));
  };

  return (
    <div className="anim-rise space-y-3">
      <TopBar title={t('notifications.title')} eyebrow={t('app.name')} onBack={() => navigate(isCoach ? '/coach' : '/')} />

      {loading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('notifications.empty')}</p>
      ) : (
        <div className="card divide-y divide-line-soft p-0">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              data-testid="notification-item"
              onClick={() => void open(n)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-start ${n.seenAt ? '' : 'bg-brand/5'}`}
            >
              <span className="row-av mt-0.5 h-9 w-9 shrink-0 bg-brand/15 text-brand">
                <Icon name={ICON[n.type] ?? 'info'} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{t(`notifications.types.${n.type}`)}</span>
                  {!n.seenAt && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                </span>
                {n.body && <span className="mt-0.5 block truncate text-[13px] text-earth-muted">{n.body}</span>}
                <span className="mt-0.5 block font-mono text-[10.5px] text-earth-subtle">{relativeTime(n.createdAt, t)}</span>
              </span>
              <Icon name="chevron" size={16} className="mt-1 text-earth-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
