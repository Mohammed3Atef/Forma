import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from '@/pages/auth/Login';
import { Landing } from '@/pages/marketing/Landing';
import { AcceptInvite } from '@/pages/auth/AcceptInvite';

/**
 * Signed-out routes. Web visitors land on the marketing page at "/"; the auth
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
    <Routes>
      <Route path="/" element={isStandalone ? <Navigate to="/login" replace /> : <Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/invite/:code" element={<AcceptInvite />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
}
