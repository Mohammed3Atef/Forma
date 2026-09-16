import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { useSession } from '@/services/auth/sessionStore';
import { useClientMessageUnread } from '@/hooks/useClientMessageUnread';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';
import { ADMIN_NAV, CLIENT_MENU, COACH_SIDEBAR, SUPER_ADMIN_NAV, type NavGroup, type NavItem } from '@/config/nav';

/**
 * Full-navigation sheet — every destination for the current role, including
 * the ones not in the (lean) bottom bar. Every role now gets the same grouped
 * rendering (Daily/Track/Coach/You for the client, Today/Coaching/Content/
 * Business/You for the coach — matching the design's nav rail exactly);
 * admin/super-admin stay a single unnamed group until their own nav pass.
 */
export function NavMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const role = useSession((s) => s.account?.role);
  const clientUnread = useClientMessageUnread();
  const coachUnread = useCoachMessageUnread();

  const isActive = (to: string, end?: boolean) => (end ? pathname === to : to !== '/' && pathname.startsWith(to));
  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const row = (item: NavItem) => {
    const active = isActive(item.to, item.end);
    const badge = item.badge === 'clientUnread' ? clientUnread : item.key === 'coachMessages' ? coachUnread : 0;
    return (
      <button
        key={item.key}
        type="button"
        data-testid={`menu-${item.key}`}
        onClick={() => go(item.to)}
        className="row w-full text-start"
      >
        <span className={`row-av ${active ? '!border-brand/50 !bg-brand/15 !text-brand' : ''}`}>
          <Icon name={item.icon} size={18} />
        </span>
        <span className={`min-w-0 flex-1 font-medium ${active ? 'text-brand' : ''}`}>{t(`nav.${item.key}`)}</span>
        {badge > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gradient-brand px-1.5 font-mono text-[10px] font-bold text-brand-ink">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
        <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle rtl:rotate-180" />
      </button>
    );
  };

  const groups: NavGroup[] =
    role === 'coach'
      ? COACH_SIDEBAR
      : role === 'super_admin'
        ? [{ group: '', items: SUPER_ADMIN_NAV }]
        : role === 'admin'
          ? [{ group: '', items: ADMIN_NAV }]
          : CLIENT_MENU;

  return (
    <Sheet open={open} onClose={onClose} title={t('nav.menu')}>
      <div data-testid="nav-menu" className="space-y-1">
        {groups.map((g, gi) => (
          <div key={g.group || gi}>
            {g.group && <p className="ui-label px-1 pb-1 pt-3 first:pt-0">{t(`nav.${g.group}`)}</p>}
            <div className="rounded-xl2 border border-line bg-surface-card px-3">{g.items.map(row)}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
