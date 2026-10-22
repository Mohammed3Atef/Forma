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
  badgeTone,
}: {
  items: NavDestination[];
  /** Accessible name of the navigation landmark. */
  label: string;
  /** Called on a tab tap — may prevent the default to guard unsaved work. */
  onNavigate?: (to: string, e: MouseEvent) => void;
  className?: string;
  /** Unread badge fill (B3.6: the coach shell uses the AA-contrast `solid`). */
  badgeTone?: 'danger' | 'solid';
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
                {it.badge ? <CountBadge count={it.badge} tone={badgeTone} className="absolute -end-2.5 -top-1.5" testId={`nav-${it.key}-badge`} /> : null}
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
/** B3.8: a labelled group of rail links (coach sidebar); a link may list its section's own pages. */
export interface RailNavGroup {
  key: string;
  label: string;
  items: (NavDestination & { children?: { key: string; to: string; label: string; current: boolean }[] })[];
}

export function SideRail({
  items,
  groups,
  label,
  onNavigate,
  header,
  footer,
  className = '',
  testId = 'client-rail',
  collapsible = false,
  badgeTone,
}: {
  items: NavDestination[];
  /**
   * B3.8 (coach): always-visible groups instead of one flat list. Expanded (≥ 1024 px) each group
   * has its heading and the active section shows its own pages beneath it; collapsed (72 px) the
   * groups are icon runs split by dividers. `items` is ignored when `groups` is given.
   */
  groups?: RailNavGroup[];
  label: string;
  onNavigate?: (to: string, e: MouseEvent) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  testId?: string;
  collapsible?: boolean;
  badgeTone?: 'danger' | 'solid';
}) {
  const width = collapsible ? 'w-[72px] lg:w-60' : 'w-60';
  return (
    <aside className={`fixed inset-y-0 start-0 z-ui-nav ${width} flex-col border-e border-white/[0.08] bg-surface ${className}`} data-testid={testId}>
      {header ? <div className={collapsible ? 'flex justify-center px-2 pb-4 pt-6 lg:block lg:px-5' : 'px-5 pb-4 pt-6'}>{header}</div> : null}
      <nav aria-label={label} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${collapsible ? 'px-2 lg:px-3' : 'px-3'}`}>
        {groups ? (
          <div className="space-y-3 pb-3">
            {groups.map((g, gi) => (
              <div key={g.key} data-testid={`rail-group-${g.key}`}>
                {gi > 0 ? <div aria-hidden className={`mx-2 mb-3 border-t border-white/[0.06] ${collapsible ? 'lg:hidden' : 'hidden'}`} /> : null}
                <h2 id={`rail-group-${g.key}-label`} className={`mb-1 px-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-earth-subtle ${collapsible ? 'sr-only lg:not-sr-only lg:block' : ''}`}>
                  {g.label}
                </h2>
                <ul className="space-y-1" aria-labelledby={`rail-group-${g.key}-label`}>
                  {g.items.map((it) => (
                    <li key={it.key}>
                      <RailLink it={it} collapsible={collapsible} badgeTone={badgeTone} onNavigate={onNavigate} />
                      {it.children?.length ? (
                        <ul className={`mt-1 space-y-0.5 border-s border-white/[0.08] ps-2 ${collapsible ? 'ms-6 hidden lg:block' : 'ms-6'}`} data-testid={`rail-${it.key}-pages`}>
                          {it.children.map((c) => (
                            <li key={c.key}>
                              <Link
                                to={c.to}
                                data-testid={`rail-sub-${it.key}-${c.key}`}
                                aria-current={c.current ? 'true' : undefined}
                                onClick={(e) => onNavigate?.(c.to, e)}
                                className={`flex min-h-ui-hit items-center rounded-ui-control px-2.5 text-[13.5px] transition-colors duration-ui-fast focus-visible:outline-2 ${c.current ? 'bg-white/[0.06] font-semibold text-earth' : 'text-earth-muted hover:bg-white/[0.04] hover:text-earth'}`}
                              >
                                <span className="min-w-0 truncate">{c.label}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
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
                  {collapsible && it.badge ? <CountBadge count={it.badge} tone={badgeTone} className="absolute -end-2.5 -top-1.5 lg:hidden" testId={`rail-${it.key}-badge-compact`} /> : null}
                </span>
                <span className={`min-w-0 flex-1 truncate ${collapsible ? 'hidden lg:block' : ''}`}>{it.label}</span>
                {it.badge ? <CountBadge count={it.badge} tone={badgeTone} className={collapsible ? 'hidden lg:inline-flex' : undefined} testId={`rail-${it.key}-badge`} /> : null}
              </Link>
            </li>
          ))}
        </ul>
        )}
      </nav>
      {footer ? <div className={`border-t border-white/[0.08] ${collapsible ? 'p-2 lg:p-3' : 'p-3'}`}>{footer}</div> : null}
    </aside>
  );
}

/** One rail destination (icon + label + badge), as the flat rail draws it. */
function RailLink({ it, collapsible, badgeTone, onNavigate }: { it: NavDestination; collapsible: boolean; badgeTone?: 'danger' | 'solid'; onNavigate?: (to: string, e: MouseEvent) => void }) {
  return (
    <Link
      to={it.to}
      data-testid={`rail-${it.key}`}
      aria-current={it.active ? 'page' : undefined}
      aria-label={collapsible ? it.label : undefined}
      title={collapsible ? it.label : undefined}
      onClick={(e) => onNavigate?.(it.to, e)}
      className={`relative flex min-h-ui-hit items-center gap-3 rounded-ui-control py-1.5 text-[15px] font-medium transition-colors duration-ui-fast ${
        collapsible ? 'justify-center px-0 lg:justify-start lg:px-3' : 'px-3'
      } ${it.active ? 'bg-white/[0.06] text-earth' : 'text-earth-muted hover:bg-white/[0.04] hover:text-earth'}`}
    >
      {it.active && <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-gradient-brand" />}
      <span className="relative flex">
        <Icon name={it.icon} size={20} className={it.active ? 'text-brand-hover' : undefined} />
        {collapsible && it.badge ? <CountBadge count={it.badge} tone={badgeTone} className="absolute -end-2.5 -top-1.5 lg:hidden" testId={`rail-${it.key}-badge-compact`} /> : null}
      </span>
      {/* B3.8: a long label ("Account & preferences") wraps to a second line — never clipped. */}
      <span className={`min-w-0 flex-1 leading-tight [overflow-wrap:anywhere] ${collapsible ? 'hidden lg:block' : ''}`}>{it.label}</span>
      {it.badge ? <CountBadge count={it.badge} tone={badgeTone} className={collapsible ? 'hidden lg:inline-flex' : undefined} testId={`rail-${it.key}-badge`} /> : null}
    </Link>
  );
}
