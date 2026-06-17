import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { useNotifications } from '@/hooks/useNotifications';
import { Icon } from './Icon';
import { NavMenuSheet } from './NavMenuSheet';

/**
 * Slim sticky app header with the Forma mark + wordmark. Shown across every
 * role's shell so the brand is always present. Pads for the status-bar safe
 * area (notch / Capacitor) so it clears native chrome.
 *
 * For the client experience (and local-only mode) it also hosts the navigation
 * menu button — the bottom bar only shows the primary tabs + the center Workout
 * action, so the full destination list (Cardio, History, Coach updates, …)
 * lives in this menu. Client + coach also get a notifications bell.
 */
export function BrandBar() {
  const { t } = useTranslation();
  const role = useSession((s) => s.account?.role);
  // Client + local-only get the overflow menu; coach/admin keep their full bottom nav.
  const showMenu = !role || role === 'client';
  // Notifications bell for the client + coach experiences.
  const showBell = !role || role === 'client' || role === 'coach';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      data-testid="brand-bar"
      className="sticky top-0 z-30 flex items-center justify-center gap-2.5 bg-surface/85 px-5 pt-3 backdrop-blur-md"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <img
        src="/Forma-logo.png"
        alt="Forma"
        className="h-9 w-auto max-w-[60%] rounded-[8px] object-contain"
      />
      {showBell && <NotificationBell coach={role === 'coach'} offsetEnd={showMenu} />}
      {showMenu && (
        <>
          <button
            type="button"
            data-testid="nav-menu-button"
            aria-label={t('nav.menu')}
            onClick={() => setMenuOpen(true)}
            className="icon-btn absolute end-3 flex h-10 w-10 items-center justify-center text-earth-muted"
          >
            <Icon name="list" size={22} />
          </button>
          <NavMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
        </>
      )}
    </header>
  );
}

/** Bell with an unread badge; navigates to the notifications feed. */
function NotificationBell({ coach, offsetEnd }: { coach: boolean; offsetEnd: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { unread } = useNotifications();
  return (
    <button
      type="button"
      data-testid="notifications-bell"
      aria-label={t('notifications.title')}
      onClick={() => navigate(coach ? '/coach/notifications' : '/notifications')}
      className={`icon-btn absolute ${offsetEnd ? 'end-14' : 'end-3'} flex h-10 w-10 items-center justify-center text-earth-muted`}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && (
        <span data-testid="notifications-badge" className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
