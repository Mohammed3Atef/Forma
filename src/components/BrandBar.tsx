import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { NavMenuSheet } from './NavMenuSheet';
import { NotificationBell } from './NotificationBell';

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
  // Every role gets the overflow menu so the full destination list (the tabs the
  // lean bottom bar can't fit) is reachable on mobile.
  const showMenu = true;
  // Every role gets the notifications bell — clients/coaches see their own feed,
  // admins/super-admins see outstanding coach plan-change requests.
  const showBell = true;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      data-testid="brand-bar"
      className="sticky top-0 z-30 flex items-center justify-between gap-2.5 bg-surface/85 px-5 pb-2 pt-3 backdrop-blur-md"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      {/* Logo sits on the logical start (right in RTL, left in LTR). */}
      <img
        src="/Forma-logo.png"
        alt="Forma"
        className="h-9 w-auto max-w-[55%] shrink-0 rounded-[8px] object-contain"
      />
      {/* Actions grouped on the logical end, in flow (no absolute positioning). */}
      {(showBell || showMenu) && (
        <div className="flex shrink-0 items-center gap-1">
          {showBell && <NotificationBell />}
          {showMenu && (
            <button
              type="button"
              data-testid="nav-menu-button"
              aria-label={t('nav.menu')}
              onClick={() => setMenuOpen(true)}
              className="icon-btn flex h-10 w-10 items-center justify-center text-earth-muted"
            >
              <Icon name="list" size={22} />
            </button>
          )}
        </div>
      )}
      {showMenu && <NavMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </header>
  );
}
