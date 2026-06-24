import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { NavItem } from '@/config/nav';
import { Icon } from '@/components/Icon';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';

/**
 * Desktop/tablet left sidebar (≥ md). Hidden on mobile (the bottom nav takes
 * over). RTL-aware via the logical `border-e`. Shows an unread badge on the
 * coach Messages item.
 */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const unread = useCoachMessageUnread(); // 0 unless a coach is signed in
  return (
    <aside
      data-testid="coach-sidebar"
      className="sticky top-0 hidden h-dvh w-[13.5rem] shrink-0 flex-col border-e border-line bg-surface-card/40 px-3 py-4 md:flex lg:w-60"
    >
      <div className="mb-5 flex items-center gap-2 px-2">
        <img src="/Forma-logo.png" alt="Forma" className="h-8 w-auto max-w-[70%] rounded-[6px] object-contain" />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end ?? false}
            data-testid={`sidebar-${item.key}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                isActive ? 'bg-brand/15 text-white' : 'text-earth-muted hover:bg-white/[0.04] hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} size={20} className={isActive ? 'text-brand' : ''} />
                <span className="truncate">{t(`nav.${item.key}`)}</span>
                {item.key === 'coachMessages' && unread > 0 && (
                  <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
