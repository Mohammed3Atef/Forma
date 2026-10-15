import { Suspense, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/ui/AppHeader';
import { IconButton } from '@/components/ui/Button';
import { BannerRegion } from '@/components/ui/Banner';
import { SideRail, TabBar, type NavDestination } from '@/components/ui/TabBar';
import { SyncStatus } from '@/components/ui/SyncStatus';
import { Avatar } from '@/components/Avatar';
import { SyncConflictNotice } from '@/components/SyncConflictNotice';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { ReminderBanner } from '@/components/ReminderBanner';
import { BannerHost } from '@/components/BannerHost';
import { LoadingState } from '@/components/ui/LoadingState';
import { useBack } from '@/hooks/useBack';
import { useClientMessageUnread } from '@/hooks/useClientMessageUnread';
import { useNotificationToasts } from '@/hooks/useNotificationToasts';
import { useSession } from '@/services/auth/sessionStore';
import { confirmLeave, hasNavGuard } from '@/stores/navGuardStore';
import { useDay } from '@/stores/dayStore';
import { CLIENT_TABS, COACH_SECTIONS, clientTabFor, clientTitleFor, isClientTabRoot, isClientTaskFlow } from '@/config/clientNav';
import { ResumeBar, useWorkoutInProgress } from './ResumeBar';
import { CoachIdentity } from './CoachNav';

/**
 * The client app shell (B2 / doc 16 + 17). One navigation system: five equal
 * tabs on phones and tablets, the same five in a side rail from 1024px, the
 * avatar → You. Tab roots carry no Back; sub-screens get one Back owned here
 * (B1 contract: history, else a validated returnTo, else the semantic parent).
 * Full-screen task flows (session, check-in) get none of the chrome.
 *
 * Kept from the old AppShell on purpose:
 * - the one BannerRegion (B1.4) and its notices;
 * - leaving through a tab resets the logging day to today (B0 / CL-04) and
 *   asks first when an unsaved-changes guard is armed;
 * - main's bottom padding `bottomnav-h + 2.5rem` (the B0 chat composer
 *   cancels exactly that — B1 known limit).
 */
export function ClientShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const goBack = useBack();
  // Toasts without a bell (B2: the bell is folded into Coach); its unseen
  // updates join unread messages on the one Coach badge.
  const { unread: updatesUnread } = useNotificationToasts();
  const messagesUnread = useClientMessageUnread();
  const workoutRunning = useWorkoutInProgress();

  if (isClientTaskFlow(pathname)) {
    return <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-6 pt-1 md:px-6">{children}</main>;
  }

  const tab = clientTabFor(pathname);
  const root = isClientTabRoot(pathname);
  const titleKey = clientTitleFor(pathname);
  const items: NavDestination[] = CLIENT_TABS.map((d) => ({
    key: d.key,
    to: d.to,
    icon: d.icon,
    label: t(d.label),
    active: d.key === tab,
    badge: d.key === 'coach' ? messagesUnread + updatesUnread : 0,
  }));

  // Leaving through a tab returns logging to today; a dirty editor asks first.
  const onNavigate = (to: string, e: MouseEvent) => {
    if (!hasNavGuard()) {
      useDay.getState().reset();
      return;
    }
    e.preventDefault();
    void confirmLeave().then((ok) => {
      if (ok) {
        useDay.getState().reset();
        navigate(to);
      }
    });
  };

  const name = account?.displayName ?? '';
  const you = (
    <button type="button" onClick={() => navigate('/settings')} aria-label={t('nav.you')} data-testid="you-button" className="hit-44 rounded-full">
      <Avatar name={name} photoUrl={account?.photoUrl} size="sm" />
    </button>
  );
  const wordmark = <img src="/brand/forma-wordmark.webp" alt="Forma" className="h-[22px] w-auto" />;

  return (
    <div className="min-h-dvh lg:ps-60" data-testid="app-shell">
      <SideRail
        className="hidden lg:flex"
        items={items}
        label={t('nav.primary')}
        onNavigate={onNavigate}
        header={wordmark}
        footer={
          <button type="button" onClick={() => navigate('/settings')} data-testid="rail-you" className={`flex min-h-ui-hit w-full items-center gap-3 rounded-ui-control px-2 text-start ${pathname.startsWith('/settings') ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}>
            <Avatar name={name} photoUrl={account?.photoUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{name || t('nav.you')}</span>
              <span className="block text-[12px] text-earth-muted">{t('nav.you')}</span>
            </span>
          </button>
        }
      />
      <AppHeader
        start={
          root ? (
            pathname === '/' ? <span className="ps-2 lg:hidden">{wordmark}</span> : null
          ) : (
            <IconButton icon="chevronLeft" label={t('common.back')} onClick={goBack} className="border-transparent" />
          )
        }
        title={
          root && pathname === '/' ? (
            <span className="hidden lg:inline">{t('nav.today')}</span>
          ) : COACH_SECTIONS.includes(pathname) ? (
            <CoachIdentity />
          ) : titleKey ? (
            t(titleKey)
          ) : null
        }
        end={
          <>
            <SyncStatus />
            <span className="lg:hidden">{you}</span>
          </>
        }
      />
      <main className="mx-auto w-full max-w-xl overflow-x-clip px-4 pb-[calc(var(--bottomnav-h)+2.5rem)] pt-3 md:px-6 lg:max-w-3xl lg:px-8 xl:max-w-5xl">
        <BannerRegion className="mt-1">
          <SyncConflictNotice />
          <SubscriptionBanner />
          <ReminderBanner />
          <BannerHost />
        </BannerRegion>
        {/* The shell stays up while a lazy screen loads (CL-06). */}
        <Suspense fallback={<LoadingState variant="list" count={4} />}>{children}</Suspense>
        {workoutRunning && pathname !== '/messages' ? <div aria-hidden="true" className="h-16" /> : null}
      </main>
      <ResumeBar />
      <TabBar className="lg:hidden" items={items} label={t('nav.primary')} onNavigate={onNavigate} />
    </div>
  );
}
