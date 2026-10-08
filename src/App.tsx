import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { syncLocalRuntime, clientRuntimeReady, runtimeAccount } from '@/data/accountRuntime';
import { applyLocale, deviceLocale } from '@/i18n';
import { useWorkout } from '@/stores/workoutStore';
import { useNutrition } from '@/stores/nutritionStore';
import { useHabits } from '@/stores/habitStore';
import { useSession } from '@/services/auth/sessionStore';
import { useDay } from '@/stores/dayStore';
import { setupPersistentStorage } from '@/lib/storage';
import { initNative } from '@/lib/native';
import { DialogHost } from '@/components/DialogHost';
import { ToastHost } from '@/components/ToastHost';
import { ImageViewer } from '@/components/ImageViewer';
import { VideoPopup } from '@/components/VideoPopup';
import { MustChangePasswordPrompt } from '@/components/MustChangePasswordPrompt';
import { ScrollToTop } from '@/components/ScrollToTop';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { PresenceTracker } from '@/components/PresenceTracker';
import { SiteAnalytics } from '@/components/SiteAnalytics';
import { BannerHost } from '@/components/BannerHost';
import { UpdateAvailable } from '@/components/UpdateAvailable';
import { Splash } from '@/components/Splash';
import { CompleteAccount } from '@/pages/auth/CompleteAccount';
import { AccountPending } from '@/pages/auth/AccountPending';
import { AccountSuspended } from '@/pages/auth/AccountSuspended';

// Code-split every role app behind React.lazy so a signed-in user only ever
// downloads their OWN role bundle — a client never ships coach/admin code, and
// coach/admin never ship the client app. The chunk load is covered by the same
// <Splash> already shown during init; the PWA precaches all chunks so a returning
// client still boots offline.
const ClientApp = lazy(() => import('@/apps/ClientApp').then((m) => ({ default: m.ClientApp })));
const CoachApp = lazy(() => import('@/apps/CoachApp').then((m) => ({ default: m.CoachApp })));
const AdminApp = lazy(() => import('@/apps/AdminApp').then((m) => ({ default: m.AdminApp })));
const AnonymousApp = lazy(() => import('@/apps/AnonymousApp').then((m) => ({ default: m.AnonymousApp })));

export function App() {
  const [ready, setReady] = useState(false);
  // The account whose local runtime (own database, and for clients the
  // stores + sync) is open — the role app mounts only once it matches.
  const [runtimeUid, setRuntimeUid] = useState<string | null>(null);
  const selectedDay = useDay((s) => s.selected);
  const phase = useSession((s) => s.phase);
  const role = useSession((s) => s.account?.role ?? 'client');
  const account = useSession((s) => s.account);
  const uid = account?.id ?? null;
  const signedIn = phase !== 'loading' && phase !== 'anonymous' && !!uid;
  const clientRuntime = signedIn && role === 'client' && runtimeUid === uid;
  // A signed-in client with no phone must provide one before using the app
  // (coaches/admins get theirs through the create-account form).
  const needsContact = !!account && account.role === 'client' && !account.phone;

  // When the focused day changes, reload all day-scoped data for that date
  // (client runtime only — coaches/admins never load client stores).
  useEffect(() => {
    if (!clientRuntime) return;
    void useNutrition.getState().load(selectedDay);
    void useWorkout.getState().loadDay(selectedDay);
    void useHabits.getState().refresh(selectedDay);
  }, [selectedDay, clientRuntime]);

  // Re-verify the session when the app returns to the foreground, so a
  // coach's account-status change (suspend / pending / reactivate) takes effect
  // on the client's next focus. Never restores a signed-out session (PWA-08).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void useSession.getState().reverify();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Boot: device language first (the splash/login need it), then the session.
  // Local data is opened per account below, once we know who is signed in.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      await applyLocale(deviceLocale() ?? 'en').catch(() => undefined);
      useSession.getState().init(); // role / identity → drives routing
      void initNative(); // native status bar + splash (Capacitor only)
      // Ask the OS not to evict our IndexedDB/CacheStorage data (login, videos,
      // photos). Retries on first user gesture if the browser defers the grant.
      setupPersistentStorage();
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Open the signed-in account's own local database (and, for clients, the
  // local-first runtime); close it on sign-out / account switch (PWA-02/04).
  useEffect(() => {
    if (phase === 'loading') return;
    const target = signedIn ? uid : null;
    let cancelled = false;
    void syncLocalRuntime(target, signedIn ? (account?.role ?? null) : null).then(() => {
      if (!cancelled) setRuntimeUid(runtimeAccount());
    });
    return () => {
      cancelled = true;
    };
  }, [phase, signedIn, uid, account?.role]);

  if (!ready || phase === 'loading') return <Splash />;
  // A signed-in role app mounts only on its own account's local data.
  if (signedIn && (runtimeUid !== uid || (role === 'client' && !clientRuntimeReady(uid)))) return <Splash />;

  // Role-based routing: the session phase + role select which app mounts. Each
  // app owns its own <Routes> with absolute paths and a catch-all redirect.
  let body: ReactNode;
  if (phase === 'anonymous') body = <AnonymousApp />;
  else if (phase === 'pending') body = <AccountPending />;
  else if (phase === 'suspended') body = <AccountSuspended />;
  else if (needsContact) body = <CompleteAccount />;
  else if (role === 'coach') body = <CoachApp />;
  else if (role === 'admin' || role === 'super_admin') body = <AdminApp />;
  else body = <ClientApp />;

  return (
    <>
      <ScrollToTop />
      <SiteAnalytics />
      <PresenceTracker />
      <OfflineBanner />
      <DialogHost />
      <ToastHost />
      <ImageViewer />
      <VideoPopup />
      <BannerHost />
      <UpdateAvailable />
      <Suspense fallback={<Splash />}>{body}</Suspense>
      <MustChangePasswordPrompt />
    </>
  );
}
