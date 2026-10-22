import type { ReactNode } from 'react';
import { BrandBar } from '@/components/BrandBar';
import { BottomNav } from '@/components/BottomNav';
import { BannerRegion } from '@/components/ui/Banner';
import { WhatsAppFab } from '@/components/WhatsAppFab';
import type { NavItem, NavGroup } from '@/config/nav';
import { useLayoutStore } from '@/stores/layoutStore';
import { SidebarNav } from './SidebarNav';
import { DesktopTopBar } from './DesktopTopBar';
import { useAppSurface } from '@/hooks/useAppSurface';
import { MAIN_ID, SkipLink, useRouteFocus } from './SkipLink';

/**
 * Responsive shell for the coach + admin portals (the client keeps the
 * mobile-first AppShell). `children` render ONCE; only the chrome swaps:
 *  - mobile (< md): BrandBar + bottom nav (unchanged experience)
 *  - tablet/desktop (≥ md): left sidebar + desktop top bar, full-width content
 * Visibility is CSS-driven (`md:hidden` / `hidden md:flex`) so there are no
 * duplicate DOM nodes and Playwright visibility checks stay honest.
 */
export function ResponsiveShell({
  navItems,
  sidebarItems,
  banners,
  children,
}: {
  navItems: NavItem[];
  sidebarItems: NavItem[] | NavGroup[];
  /** This role's shell-level notices — rendered in the one banner region (B1.4). */
  banners?: ReactNode;
  children: ReactNode;
}) {
  useAppSurface();
  useRouteFocus();
  // Data-dense pages opt into full width via useFullBleed(); others stay capped.
  const fullBleed = useLayoutStore((s) => s.fullBleed);
  return (
    <div className="min-h-full md:flex md:min-h-dvh" data-testid="app-shell">
      <SkipLink />
      <SidebarNav items={sidebarItems} />
      <div className="flex min-h-full w-full min-w-0 flex-col md:min-h-0 md:flex-1">
        <div className="md:hidden">
          <BrandBar />
        </div>
        <div className="hidden md:block">
          <DesktopTopBar />
        </div>
        <main id={MAIN_ID} tabIndex={-1} className={`mx-auto w-full max-w-md flex-1 overflow-x-hidden outline-none px-5 pb-[calc(var(--bottomnav-h)+2.5rem)] pt-1 md:px-6 md:pb-8 md:pt-5 lg:px-8 ${fullBleed ? 'md:max-w-none' : 'md:max-w-screen-2xl'}`}>
          {banners ? <BannerRegion className="mt-2 md:mt-0">{banners}</BannerRegion> : null}
          {children}
        </main>
        <div className="md:hidden">
          <BottomNav items={navItems} />
        </div>
      </div>
      <WhatsAppFab />
    </div>
  );
}
