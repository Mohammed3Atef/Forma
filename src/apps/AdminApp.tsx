import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ResponsiveShell } from '@/components/shell/ResponsiveShell';
import { CommandHost } from '@/components/CommandHost';
import { LoadingState } from '@/components/ui/LoadingState';
import { ADMIN_NAV, SUPER_ADMIN_NAV } from '@/config/nav';
import { useRole } from '@/services/auth/permissions';
import { queryClient } from '@/services/platform/queryClient';
import { RoleAccount } from '@/pages/RoleAccount';
import { Notifications } from '@/pages/Notifications';

// Heavy admin route pages are lazy so the admin bundle stays small.
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminAccounts = lazy(() => import('@/pages/admin/AdminAccounts').then((m) => ({ default: m.AdminAccounts })));
const AdminClientDetail = lazy(() => import('@/pages/admin/AdminClientDetail').then((m) => ({ default: m.AdminClientDetail })));
const AdminAssignments = lazy(() => import('@/pages/admin/AdminAssignments').then((m) => ({ default: m.AdminAssignments })));
const AdminGovernance = lazy(() => import('@/pages/admin/AdminGovernance').then((m) => ({ default: m.AdminGovernance })));
const AdminAnalytics = lazy(() => import('@/pages/admin/AdminAnalytics').then((m) => ({ default: m.AdminAnalytics })));
const AdminMedia = lazy(() => import('@/pages/admin/AdminMedia').then((m) => ({ default: m.AdminMedia })));
const AdminCoaches = lazy(() => import('@/pages/admin/AdminCoaches').then((m) => ({ default: m.AdminCoaches })));
const AdminCoachDetail = lazy(() => import('@/pages/admin/AdminCoachDetail').then((m) => ({ default: m.AdminCoachDetail })));
const AdminPlans = lazy(() => import('@/pages/admin/AdminPlans').then((m) => ({ default: m.AdminPlans })));

/**
 * Admin / super-admin shell. Both roles share the `/admin/*` prefix and nav;
 * super-admin-only screens (governance, media) are gated by role/permission
 * inside each screen. Online platform reads run through React Query.
 */
export function AdminApp() {
  const nav = useRole() === 'super_admin' ? SUPER_ADMIN_NAV : ADMIN_NAV;
  const shell = (node: ReactNode) => (
    <ResponsiveShell navItems={nav} sidebarItems={nav}>
      {node}
    </ResponsiveShell>
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div className="px-5 pt-6 md:px-6"><LoadingState variant="cards" count={4} /></div>}>
      <Routes>
        <Route path="/admin" element={shell(<AdminDashboard />)} />
        <Route path="/admin/accounts" element={shell(<AdminAccounts />)} />
        <Route path="/admin/clients/:clientId" element={shell(<AdminClientDetail />)} />
        <Route path="/admin/assignments" element={shell(<AdminAssignments />)} />
        <Route path="/admin/governance" element={shell(<AdminGovernance />)} />
        <Route path="/admin/analytics" element={shell(<AdminAnalytics />)} />
        <Route path="/admin/coaches" element={shell(<AdminCoaches />)} />
        <Route path="/admin/coaches/:coachId" element={shell(<AdminCoachDetail />)} />
        <Route path="/admin/plans" element={shell(<AdminPlans />)} />
        <Route path="/admin/media" element={shell(<AdminMedia />)} />
        <Route path="/admin/notifications" element={shell(<Notifications />)} />
        <Route path="/admin/settings" element={shell(<RoleAccount />)} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
      </Suspense>
      <CommandHost />
    </QueryClientProvider>
  );
}
