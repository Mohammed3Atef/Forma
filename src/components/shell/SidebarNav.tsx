import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { NavItem, NavGroup } from '@/config/nav';
import { Icon } from '@/components/Icon';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';

function isGrouped(items: NavItem[] | NavGroup[]): items is NavGroup[] {
  return items.length > 0 && 'items' in items[0];
}

/**
 * Desktop/tablet left sidebar. Three tiers, matching the design's rail: hidden
 * below `md` (768px — the bottom nav takes over), icon-only between `md` and
 * `lg` (tablet), icon+label from `lg` (1024px) up. RTL-aware via the logical
 * `border-e`. Shows an unread badge on the coach Messages item. Accepts either
 * a flat `NavItem[]` or a grouped `NavGroup[]` (rendered with the design's
 * `.rg` group-caption treatment — a divider line at the icon-only tablet
 * tier, a real caption from `lg` up).
 */
export function SidebarNav({ items }: { items: NavItem[] | NavGroup[] }) {
  const { t } = useTranslation();
  const unread = useCoachMessageUnread(); // 0 unless a coach is signed in
  const groups: NavGroup[] = isGrouped(items) ? items : [{ group: '', items }];
  return (
    <aside
      data-testid="coach-sidebar"
      className="sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col border-e border-line bg-surface-card/40 px-2 py-4 md:flex lg:w-60 lg:px-3"
    >
      <div className="mb-5 flex items-center justify-center gap-2 px-2 lg:justify-start">
        <img src="/forma-mark.png" alt="" aria-hidden="true" className="h-8 w-8 shrink-0 object-contain lg:hidden" />
        <img src="/Forma-logo.png" alt="Forma" className="hidden h-8 w-auto max-w-[70%] rounded-[6px] object-contain lg:block" />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {groups.map((g, gi) => (
          <div key={g.group || gi}>
            {g.group && (
              <>
                <p className={`hidden truncate px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.09em] text-earth-subtle lg:block ${gi === 0 ? 'pt-0' : 'pt-3'}`}>
                  {t(`nav.${g.group}`)}
                </p>
                <div className={`mx-2 h-px bg-line md:block lg:hidden ${gi === 0 ? 'mb-1.5' : 'my-1.5'}`} />
              </>
            )}
            {g.items.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.end ?? false}
                data-testid={`sidebar-${item.key}`}
                title={t(`nav.${item.key}`)}
                className={({ isActive }) =>
                  `relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors lg:justify-start ${
                    isActive ? 'bg-brand/15 text-white' : 'text-earth-muted hover:bg-white/[0.04] hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} size={20} className={isActive ? 'text-brand' : ''} />
                    <span className="hidden truncate lg:inline">{t(`nav.${item.key}`)}</span>
                    {item.key === 'coachMessages' && unread > 0 && (
                      <span className="absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white lg:static lg:ms-auto lg:h-5 lg:min-w-5 lg:text-[11px]">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
