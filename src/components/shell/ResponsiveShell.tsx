import type { ReactNode } from 'react';
import { BrandBar } from '@/components/BrandBar';
import { BottomNav } from '@/components/BottomNav';
import { ReminderBanner } from '@/components/ReminderBanner';
import { WhatsAppFab } from '@/components/WhatsAppFab';
import type { NavItem } from '@/config/nav';
import { SidebarNav } from './SidebarNav';
import { DesktopTopBar } from './DesktopTopBar';

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
  children,
}: {
  navItems: NavItem[];
  sidebarItems: NavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-full md:flex md:min-h-dvh" data-testid="app-shell">
      <SidebarNav items={sidebarItems} />
      <div className="flex min-h-full w-full min-w-0 flex-col md:min-h-0 md:flex-1">
        <div className="md:hidden">
          <BrandBar />
        </div>
        <div className="hidden md:block">
          <DesktopTopBar />
        </div>
        <ReminderBanner />
        <main className="mx-auto w-full max-w-md flex-1 overflow-x-hidden px-5 pb-28 pt-1 md:max-w-screen-2xl md:px-6 md:pb-8 md:pt-5 lg:px-8">
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
