import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '@/components/Icon';
import { CountBadge } from './Button';

export interface NavDestination {
  key: string;
  to: string;
  icon: IconName;
  label: string;
  active: boolean;
  /** Unread count shown on the icon (0 = none). */
  badge?: number;
}

/**
 * Phone tab bar (B2, doc 17 "BottomNav" from the website's phone tab bar):
 * equal tabs, icon + readable label, active by shape + colour (top indicator,
 * amber label) — never by opacity. Solid surface, hairline top, the home
 * indicator inset owned here. Items stay real links (`<a>`), so they work
 * with every link affordance and the offline-boot check.
 */
export function TabBar({
  items,
  label,
  onNavigate,
  className = '',
}: {
  items: NavDestination[];
  /** Accessible name of the navigation landmark. */
  label: string;
  /** Called on a tab tap — may prevent the default to guard unsaved work. */
  onNavigate?: (to: string, e: MouseEvent) => void;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      data-testid="bottom-nav"
      className={`fixed inset-x-0 bottom-0 z-ui-nav border-t border-white/[0.08] bg-surface ${className}`}
      style={{ paddingBottom: 'var(--shell-safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--bottomnav-h)] max-w-xl items-stretch">
        {items.map((it) => (
          <li key={it.key} className="flex flex-1">
            <Link
              to={it.to}
              data-testid={`nav-${it.key}`}
              aria-current={it.active ? 'page' : undefined}
              onClick={(e) => onNavigate?.(it.to, e)}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-ui-fast ${
                it.active ? 'text-brand-hover' : 'text-earth-muted hover:text-earth'
              }`}
            >
              {it.active && <span aria-hidden="true" className="absolute inset-x-[22%] top-0 h-[3px] rounded-b-full bg-gradient-brand" />}
              <span className="relative">
                <Icon name={it.icon} size={24} />
                {it.badge ? <CountBadge count={it.badge} className="absolute -end-2.5 -top-1.5" testId={`nav-${it.key}-badge`} /> : null}
              </span>
              <span className="max-w-full truncate px-1 text-[12px] font-medium leading-none">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Desktop side rail (B2): the same destinations as the tab bar — no
 * desktop-only places (doc 16 P8) — with an optional header (logo) and footer
 * (the account entry).
 *
 * B3.1 (coach): `collapsible` gives the 768–1023 px variant — a 72 px icon
 * rail whose labels appear from 1024 px; links keep an accessible name and a
 * tooltip while collapsed. `testId` lets each role keep its own hook (the
 * client keeps `client-rail`).
 */
export function SideRail({
  items,
  label,
  onNavigate,
  header,
  footer,
  className = '',
  testId = 'client-rail',
  collapsible = false,
}: {
  items: NavDestination[];
  label: string;
  onNavigate?: (to: string, e: MouseEvent) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  testId?: string;
  collapsible?: boolean;
}) {
  const width = collapsible ? 'w-[72px] lg:w-60' : 'w-60';
  return (
    <aside className={`fixed inset-y-0 start-0 z-ui-nav ${width} flex-col border-e border-white/[0.08] bg-surface ${className}`} data-testid={testId}>
      {header ? <div className={collapsible ? 'flex justify-center px-2 pb-4 pt-6 lg:block lg:px-5' : 'px-5 pb-4 pt-6'}>{header}</div> : null}
      <nav aria-label={label} className={collapsible ? 'flex-1 px-2 lg:px-3' : 'flex-1 px-3'}>
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key}>
              <Link
                to={it.to}
                data-testid={`rail-${it.key}`}
                aria-current={it.active ? 'page' : undefined}
                aria-label={collapsible ? it.label : undefined}
                title={collapsible ? it.label : undefined}
                onClick={(e) => onNavigate?.(it.to, e)}
                className={`relative flex min-h-ui-hit items-center gap-3 rounded-ui-control text-[15px] font-medium transition-colors duration-ui-fast ${
                  collapsible ? 'justify-center px-0 lg:justify-start lg:px-3' : 'px-3'
                } ${it.active ? 'bg-white/[0.06] text-earth' : 'text-earth-muted hover:bg-white/[0.04] hover:text-earth'}`}
              >
                {it.active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-gradient-brand" />}
                <span className="relative flex">
                  <Icon name={it.icon} size={20} className={it.active ? 'text-brand-hover' : undefined} />
                  {collapsible && it.badge ? <CountBadge count={it.badge} className="absolute -end-2.5 -top-1.5 lg:hidden" testId={`rail-${it.key}-badge-compact`} /> : null}
                </span>
                <span className={`min-w-0 flex-1 truncate ${collapsible ? 'hidden lg:block' : ''}`}>{it.label}</span>
                {it.badge ? <CountBadge count={it.badge} className={collapsible ? 'hidden lg:inline-flex' : undefined} testId={`rail-${it.key}-badge`} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {footer ? <div className={`border-t border-white/[0.08] ${collapsible ? 'p-2 lg:p-3' : 'p-3'}`}>{footer}</div> : null}
    </aside>
  );
}
