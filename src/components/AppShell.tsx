import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { BrandBar } from './BrandBar';
import { ReminderBanner } from './ReminderBanner';
import { RestTimerBar } from './RestTimerBar';
import { DayNav } from './DayNav';
import { useTimer } from '@/stores/timerStore';
import { CLIENT_NAV, type NavItem } from '@/config/nav';

interface AppShellProps {
  children: ReactNode;
  /** Hide the bottom nav (e.g. during an active workout session). */
  hideNav?: boolean;
  /** Show the day navigator (day-scoped pages: home, workout, nutrition, cardio). */
  showDayNav?: boolean;
  /** Bottom-nav tabs for the active role. Defaults to the client tabs. */
  navItems?: NavItem[];
}

export function AppShell({ children, hideNav, showDayNav, navItems = CLIENT_NAV }: AppShellProps) {
  const timerActive = useTimer((s) => s.running || s.paused);
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col" data-testid="app-shell">
      {!hideNav && <BrandBar />}
      <ReminderBanner />
      <main className={`flex-1 px-5 pt-1 ${hideNav ? 'pb-4' : 'pb-28'}`}>
        {showDayNav && <DayNav />}
        {children}
      </main>
      {/* Global rest-timer card (shown when a timer runs outside the session screen) */}
      {!hideNav && timerActive && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-5">
          <RestTimerBar />
        </div>
      )}
      {!hideNav && <BottomNav items={navItems} />}
    </div>
  );
}
