import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { useSession } from '@/services/auth/sessionStore';
import { ADMIN_NAV, CLIENT_MENU, COACH_SIDEBAR, SUPER_ADMIN_NAV } from '@/config/nav';

/**
 * Full-navigation sheet — every destination for the current role, including the
 * ones not in the (lean) bottom bar. Client gets CLIENT_MENU; coach gets the
 * full COACH_SIDEBAR; admin/super-admin get their nav so mobile can reach all tabs.
 */
export function NavMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = useSession((s) => s.account?.role);
  const items = role === 'coach' ? COACH_SIDEBAR : role === 'super_admin' ? SUPER_ADMIN_NAV : role === 'admin' ? ADMIN_NAV : CLIENT_MENU;

  const isActive = (to: string, end?: boolean) => (end ? pathname === to : to !== '/' && pathname.startsWith(to));

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('nav.menu')}>
      <div className="grid grid-cols-2 gap-2.5" data-testid="nav-menu">
        {items.map((item) => {
          const active = isActive(item.to, item.end);
          return (
            <button
              key={item.key}
              type="button"
              data-testid={`menu-${item.key}`}
              onClick={() => go(item.to)}
              className={`flex items-center gap-3 rounded-xl2 border px-3 py-3 text-start ${
                active ? 'border-brand/50 bg-brand/10 text-white' : 'border-line bg-surface-card text-earth'
              }`}
            >
              <span className={active ? 'text-brand' : 'text-earth-muted'}>
                <Icon name={item.icon} size={20} />
              </span>
              <span className="font-medium">{t(`nav.${item.key}`)}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
