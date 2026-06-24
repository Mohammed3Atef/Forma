import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ResponsiveShell } from '@/components/shell/ResponsiveShell';
import { ADMIN_NAV, SUPER_ADMIN_NAV } from '@/config/nav';
import { useRole } from '@/services/auth/permissions';
import { queryClient } from '@/services/platform/queryClient';
import { RoleAccount } from '@/pages/RoleAccount';
import { AdminOverview } from '@/pages/admin/AdminOverview';
import { AdminAccounts } from '@/pages/admin/AdminAccounts';
import { AdminClientDetail } from '@/pages/admin/AdminClientDetail';
import { AdminAssignments } from '@/pages/admin/AdminAssignments';
import { AdminGovernance } from '@/pages/admin/AdminGovernance';
import { AdminAnalytics } from '@/pages/admin/AdminAnalytics';
import { AdminMedia } from '@/pages/admin/AdminMedia';

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
      <Routes>
        <Route path="/admin" element={shell(<AdminOverview />)} />
        <Route path="/admin/accounts" element={shell(<AdminAccounts />)} />
        <Route path="/admin/clients/:clientId" element={shell(<AdminClientDetail />)} />
        <Route path="/admin/assignments" element={shell(<AdminAssignments />)} />
        <Route path="/admin/governance" element={shell(<AdminGovernance />)} />
        <Route path="/admin/analytics" element={shell(<AdminAnalytics />)} />
        <Route path="/admin/media" element={shell(<AdminMedia />)} />
        <Route path="/admin/settings" element={shell(<RoleAccount />)} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
