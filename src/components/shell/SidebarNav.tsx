import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { NavItem, NavGroup } from '@/config/nav';
import { Icon } from '@/components/Icon';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';
import { useSidebarStore } from '@/stores/sidebarStore';

function isGrouped(items: NavItem[] | NavGroup[]): items is NavGroup[] {
  return items.length > 0 && 'items' in items[0];
}

/**
 * Desktop/tablet left sidebar. Three tiers, matching the design's rail: hidden
 * below `md` (768px — the bottom nav takes over), icon-only between `md` and
 * `lg` (tablet, always — unaffected by the collapse preference below),
 * icon+label from `lg` (1024px) up UNLESS the user has explicitly collapsed
 * it (a persisted desktop-only preference — see `sidebarStore`), in which
 * case it stays icon-only at any width. RTL-aware via the logical `border-e`.
 * Shows an unread badge on the coach Messages item. Accepts either a flat
 * `NavItem[]` or a grouped `NavGroup[]` (rendered with the design's `.rg`
 * group-caption treatment — a divider line whenever icon-only, a real
 * caption only when expanded).
 */
export function SidebarNav({ items }: { items: NavItem[] | NavGroup[] }) {
  const { t } = useTranslation();
  const unread = useCoachMessageUnread(); // 0 unless a coach is signed in
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const groups: NavGroup[] = isGrouped(items) ? items : [{ group: '', items }];
  // Only the `lg:` (desktop) tier ever changes with `collapsed` — the base
  // (mobile-hidden, tablet icon-only) classes always apply first.
  const expandedAtDesktop = !collapsed;
  return (
    <aside
      data-testid="coach-sidebar"
      className={`sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col border-e border-line bg-surface-card/40 px-2 py-4 transition-[width] duration-200 md:flex ${expandedAtDesktop ? 'lg:w-60 lg:px-3' : ''}`}
    >
      <div className={`mb-5 flex items-center gap-2 px-2 ${expandedAtDesktop ? 'justify-center lg:justify-start' : 'justify-center'}`}>
        <img src="/forma-mark.png" alt="" aria-hidden="true" className={`h-8 w-8 shrink-0 object-contain ${expandedAtDesktop ? 'lg:hidden' : ''}`} />
        {expandedAtDesktop && <img src="/Forma-logo.png" alt="Forma" className="hidden h-8 w-auto max-w-[70%] rounded-[6px] object-contain lg:block" />}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {groups.map((g, gi) => (
          <div key={g.group || gi}>
            {g.group && (
              <>
                {expandedAtDesktop && (
                  <p className={`hidden truncate px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.09em] text-earth-subtle lg:block ${gi === 0 ? 'pt-0' : 'pt-3'}`}>
                    {t(`nav.${g.group}`)}
                  </p>
                )}
                <div className={`mx-2 h-px bg-line md:block ${expandedAtDesktop ? 'lg:hidden' : ''} ${gi === 0 ? 'mb-1.5' : 'my-1.5'}`} />
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
                  `relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${expandedAtDesktop ? 'lg:justify-start' : ''} ${
                    isActive ? 'bg-brand/15 text-white' : 'text-earth-muted hover:bg-white/[0.04] hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon name={item.icon} size={20} className={isActive ? 'text-brand' : ''} />
                    <span className={`truncate ${expandedAtDesktop ? 'hidden lg:inline' : 'hidden'}`}>{t(`nav.${item.key}`)}</span>
                    {item.key === 'coachMessages' && unread > 0 && (
                      <span
                        className={`absolute end-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white ${expandedAtDesktop ? 'lg:static lg:ms-auto lg:h-5 lg:min-w-5 lg:text-[11px]' : ''}`}
                      >
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
      {/* Explicit collapse/expand control — desktop only; below `lg` the rail
          is always icon-only by breakpoint alone, so toggling would do nothing. */}
      <button
        type="button"
        onClick={toggle}
        data-testid="sidebar-collapse-toggle"
        aria-label={t(collapsed ? 'common.expandSidebar' : 'common.collapseSidebar')}
        title={t(collapsed ? 'common.expandSidebar' : 'common.collapseSidebar')}
        className={`mt-1 hidden items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-earth-muted transition-colors hover:bg-white/[0.04] hover:text-white lg:flex ${expandedAtDesktop ? 'justify-start' : 'justify-center'}`}
      >
        <Icon name="chevronLeft" size={18} className={collapsed ? 'rotate-180' : ''} />
        {expandedAtDesktop && <span className="truncate">{t('common.collapseSidebar')}</span>}
      </button>
    </aside>
  );
}
