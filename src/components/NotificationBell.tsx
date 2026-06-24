import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { useNotifications } from '@/hooks/useNotifications';
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
  const { unread } = useNotifications();
  const to = role === 'coach' ? '/coach/notifications' : '/notifications';
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
