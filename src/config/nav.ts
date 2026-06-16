import type { IconName } from '@/components/Icon';
import type { Role } from '@/types';

/** One bottom-nav tab. `key` resolves to the i18n key `nav.<key>`. */
export interface NavItem {
  to: string;
  icon: IconName;
  key: string;
  /** Match only the exact path (used for each role's index tab). */
  end?: boolean;
}

export const CLIENT_NAV: NavItem[] = [
  { to: '/', icon: 'home', key: 'home', end: true },
  { to: '/workout', icon: 'dumbbell', key: 'workout' },
  { to: '/nutrition', icon: 'meal', key: 'nutrition' },
  { to: '/cardio', icon: 'activity', key: 'cardio' },
  { to: '/progress', icon: 'chart', key: 'progress' },
  { to: '/settings', icon: 'user', key: 'settings' },
];

export const COACH_NAV: NavItem[] = [
  { to: '/coach', icon: 'user', key: 'coachClients', end: true },
  { to: '/coach/library', icon: 'dumbbell', key: 'coachLibrary' },
  { to: '/coach/templates', icon: 'list', key: 'coachTemplates' },
  { to: '/coach/adherence', icon: 'target', key: 'coachAdherence' },
  { to: '/coach/messages', icon: 'info', key: 'coachMessages' },
  { to: '/coach/settings', icon: 'settings', key: 'coachSettings' },
];

/** Shared by admin and super_admin; super-admin-only screens are gated inside. */
export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', icon: 'chart', key: 'adminOverview', end: true },
  { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
  { to: '/admin/assignments', icon: 'target', key: 'adminAssignments' },
  { to: '/admin/governance', icon: 'settings', key: 'adminGovernance' },
  { to: '/admin/analytics', icon: 'bolt', key: 'adminAnalytics' },
];

export const NAV: Record<Role, NavItem[]> = {
  client: CLIENT_NAV,
  coach: COACH_NAV,
  admin: ADMIN_NAV,
  super_admin: ADMIN_NAV,
};
