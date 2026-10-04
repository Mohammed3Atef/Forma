import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/services/platform/queryClient';
import { Landing } from '@/pages/marketing/Landing';
import { AcceptInvite } from '@/pages/auth/AcceptInvite';
import { ResetPassword } from '@/pages/auth/ResetPassword';

// Code-split: the cinematic rebuild pulls in three.js, which no other route
// needs — keep that weight out of everyone else's bundle.
const Experience = lazy(() => import('@/pages/experience/Experience').then((m) => ({ default: m.Experience })));

// The public website (claude.ai/design "Forma Website", as typed components) — its own chunk, kept out of the app bundle.
const sitePages = () => import('@/pages/website/SitePages');
const WebsiteHome = lazy(() => sitePages().then((m) => ({ default: m.SiteHome })));
const WebsiteContact = lazy(() => sitePages().then((m) => ({ default: m.SiteContact })));
const WebsiteLegal = lazy(() => sitePages().then((m) => ({ default: m.SiteLegal })));
const WebsiteAuth = lazy(() => sitePages().then((m) => ({ default: m.SiteAuth })));

/** Dark placeholder while the website chunk loads — matches the design's background, so no white flash. */
const site = (el: ReactNode) => <Suspense fallback={<div className="min-h-dvh bg-surface" />}>{el}</Suspense>;

/** The previous marketing page, kept reachable as a draft — never indexed. */
function NoIndex({ children }: { children: ReactNode }) {
  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);
  return <>{children}</>;
}

/**
 * Signed-out routes. Web visitors land on the public website at "/" (plus
 * /contact and the legal pages); the previous landing page is a hidden draft
 * at /landing-v1. The auth
 * form lives at "/login" (CTAs route there, `?signup=1` opens sign-up). Any
 * other deep link falls through to the login form so a returning user can sign
 * in and be routed on by their role app.
 *
 * Installed PWAs skip the marketing detour and open straight to the login form
 * (the app icon should behave like an app, not a brochure).
 */
const isStandalone =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

export function AnonymousApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={isStandalone ? <Navigate to="/login" replace /> : site(<WebsiteHome />)} />
        <Route path="/contact" element={site(<WebsiteContact />)} />
        <Route path="/terms" element={site(<WebsiteLegal doc="terms" />)} />
        <Route path="/privacy" element={site(<WebsiteLegal doc="privacy" />)} />
        <Route path="/cookies" element={site(<WebsiteLegal doc="cookies" />)} />
        <Route
          path="/landing-v1"
          element={
            <NoIndex>
              <Landing />
            </NoIndex>
          }
        />
        <Route
          path="/experience"
          element={
            <Suspense fallback={null}>
              <Experience />
            </Suspense>
          }
        />
        <Route path="/login" element={site(<WebsiteAuth />)} />
        <Route path="/invite/:code" element={<AcceptInvite />} />
        <Route path="/reset/:token" element={<ResetPassword />} />
        <Route path="*" element={site(<WebsiteAuth />)} />
      </Routes>
    </QueryClientProvider>
  );
}
