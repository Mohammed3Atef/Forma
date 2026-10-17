import { Suspense, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '@/components/ui/AppHeader';
import { IconButton } from '@/components/ui/Button';
import { BannerRegion } from '@/components/ui/Banner';
import { SideRail, TabBar, type NavDestination } from '@/components/ui/TabBar';
import { SyncStatus } from '@/components/ui/SyncStatus';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { LoadingState } from '@/components/ui/LoadingState';
import { Avatar } from '@/components/Avatar';
import { useBack } from '@/hooks/useBack';
import { useCoachMessageUnread } from '@/hooks/useCoachMessageUnread';
import { useNotificationToasts } from '@/hooks/useNotificationToasts';
import { useSession } from '@/services/auth/sessionStore';
import { useCommandStore } from '@/stores/commandStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { confirmLeave, hasNavGuard } from '@/stores/navGuardStore';
import { COACH_ME, COACH_TABS, coachAreaFor, coachShellShowsBack, coachTabFor, isCoachRoot } from '@/config/coachNav';

/**
 * The coach app shell (B3.1 / blueprint §5.2). One navigation system for every
 * width — the same four destinations (Today · Clients · Messages · Library):
 *  - < 768 px: `AppHeader` + `TabBar` (4 tabs), the avatar opens **Me**;
 *  - 768–1023 px: collapsed `SideRail` (icons + tooltips, Me at the bottom);
 *  - ≥ 1024 px: expanded `SideRail` (labels, Me with name).
 * No ☰ menu, no WhatsApp button (Help lives in Me — RM-34, RM-48, CO-28).
 *
 * Kept from `ResponsiveShell` on purpose (contracts C12 / C23): the one banner
 * region, main's bottom padding `bottomnav-h + 2.5rem` on phones (the chat
 * composer cancels exactly that), full-bleed pages on wide screens.
 * Every exit from here — tab, rail, Me, avatar, Back, ⌘K — goes
 * through the unsaved-changes guard (NAV-K05).
 *
 * B3.2 (O-5): no notifications bell — Today is where coach events become
 * work (check-ins, assessments, freeze requests), and Messages keeps its own
 * unread badge, so nothing is signalled twice. The shell still runs the
 * notification toasts (formerly mounted only by the bell): a new check-in or
 * message still pops up wherever the coach is.
 */
export function CoachShell({ banners, children }: { banners?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);
  const goBack = useBack();
  const unread = useCoachMessageUnread();
  useNotificationToasts();
  const openSearch = useCommandStore((s) => s.show);
  const fullBleed = useLayoutStore((s) => s.fullBleed);

  const tab = coachTabFor(pathname);
  const inMe = coachAreaFor(pathname) === 'me';
  const items: NavDestination[] = COACH_TABS.map((d) => ({
    key: d.key,
    to: d.to,
    icon: d.icon,
    label: t(d.label),
    active: d.key === tab,
    badge: d.key === 'messages' ? unread : 0,
  }));

  // A dirty editor asks before any shell navigation; nothing dirty → the link's own navigation runs.
  const onNavigate = (to: string, e: MouseEvent) => {
    if (!hasNavGuard()) return;
    e.preventDefault();
    void confirmLeave().then((ok) => {
      if (ok) navigate(to);
    });
  };
  const goMe = () => {
    void confirmLeave().then((ok) => {
      if (ok) navigate(COACH_ME);
    });
  };

  const name = account?.displayName || account?.email || '';
  const wordmark = <img src="/brand/forma-wordmark.webp" alt="Forma" className="h-[22px] w-auto" />;
  const meButton = (
    <button type="button" onClick={goMe} aria-label={t('coachNav.me')} aria-current={inMe ? 'page' : undefined} data-testid="me-button" className={`hit-44 rounded-full ${inMe ? 'ring-2 ring-brand/70 ring-offset-2 ring-offset-surface' : ''}`}>
      <Avatar name={name} photoUrl={account?.photoUrl} size="sm" />
    </button>
  );

  return (
    // `--desktop-topbar-h`: sticky panels (DetailPanel) clear the coach's 56 px header, not the admin's 64 px top bar.
    <div className="min-h-dvh md:ps-[72px] lg:ps-60" data-testid="app-shell" style={{ ['--desktop-topbar-h' as string]: '3.5rem' }}>
      <SideRail
        className="hidden md:flex"
        testId="coach-rail"
        collapsible
        items={items}
        label={t('coachNav.primary')}
        onNavigate={onNavigate}
        header={
          <>
            <img src="/brand/forma-wordmark.webp" alt="Forma" className="hidden h-[22px] w-auto lg:block" />
            <img src="/forma-mark-128.webp" alt="" aria-hidden="true" className="h-8 w-8 object-contain lg:hidden" />
          </>
        }
        footer={
          <button
            type="button"
            onClick={goMe}
            data-testid="rail-me"
            aria-current={inMe ? 'page' : undefined}
            aria-label={t('coachNav.me')}
            title={t('coachNav.me')}
            className={`flex min-h-ui-hit w-full items-center justify-center gap-3 rounded-ui-control px-0 text-start lg:justify-start lg:px-2 ${inMe ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
          >
            <Avatar name={name} photoUrl={account?.photoUrl} size="sm" />
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-[14px] font-medium">{name || t('coachNav.me')}</span>
              <span className="block text-[12px] text-earth-muted">{t('coachNav.me')}</span>
            </span>
          </button>
        }
      />
      <AppHeader
        start={
          coachShellShowsBack(pathname) ? (
            <IconButton icon="chevronLeft" label={t('common.back')} onClick={goBack} className="border-transparent" data-testid="shell-back" />
          ) : isCoachRoot(pathname) ? (
            <span className="ps-2 md:hidden">{wordmark}</span>
          ) : null
        }
        end={
          <>
            <GlobalSearch onOpen={openSearch} className="hidden w-64 md:flex lg:w-72" />
            <SyncStatus />
            <span className="md:hidden">{meButton}</span>
          </>
        }
      />
      <main className={`mx-auto w-full max-w-md overflow-x-clip px-5 pb-[calc(var(--bottomnav-h)+2.5rem)] pt-1 md:px-6 md:pb-8 md:pt-4 lg:px-8 ${fullBleed ? 'md:max-w-none' : 'md:max-w-screen-2xl'}`}>
        {banners ? <BannerRegion className="mt-2 md:mt-0">{banners}</BannerRegion> : null}
        {/* The shell stays up while a lazy screen loads (CL-06 for the coach). */}
        <Suspense fallback={<LoadingState variant="cards" count={4} />}>{children}</Suspense>
      </main>
      <TabBar className="md:hidden" items={items} label={t('coachNav.primary')} onNavigate={onNavigate} />
    </div>
  );
}
