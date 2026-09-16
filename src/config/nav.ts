import type { IconName } from '@/components/Icon';
import type { Role } from '@/types';

/** One bottom-nav tab. `key` resolves to the i18n key `nav.<key>`. */
export interface NavItem {
  to: string;
  icon: IconName;
  key: string;
  /** Match only the exact path (used for each role's index tab). */
  end?: boolean;
  /** Render as the prominent raised center action (client workout button). */
  center?: boolean;
  /** Live unread-count badge (e.g. Inbox). */
  badge?: 'clientUnread';
}

/** A labelled group of nav items — `group` resolves to the i18n key `nav.<group>`. */
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/**
 * Client bottom bar — matches the approved design's exact tab set, order,
 * icons and labels: Today / Fuel / Train (center FAB) / Progress / Inbox.
 * Everything else lives in the grouped "Navigate" menu sheet (CLIENT_MENU),
 * opened from the brand bar.
 */
export const CLIENT_NAV: NavItem[] = [
  { to: '/', icon: 'home', key: 'today', end: true },
  { to: '/nutrition', icon: 'meal', key: 'fuel' },
  { to: '/workout', icon: 'dumbbell', key: 'train', center: true },
  { to: '/progress', icon: 'chart', key: 'progress' },
  { to: '/messages', icon: 'chat', key: 'inbox', badge: 'clientUnread' },
];

/**
 * Every client destination, grouped exactly like the design's nav rail
 * (Daily / Track / Coach / You) — shown in the "Navigate" menu sheet. Real
 * destinations the prototype doesn't have a slot for (Cardio, History, Coach
 * Notes) are folded into the group they naturally belong with; Notifications
 * isn't repeated here since the bell in the brand bar already reaches it.
 */
export const CLIENT_MENU: NavGroup[] = [
  {
    group: 'groupDaily',
    items: [
      { to: '/', icon: 'home', key: 'today', end: true },
      { to: '/workout', icon: 'dumbbell', key: 'train' },
      { to: '/nutrition', icon: 'meal', key: 'fuel' },
      { to: '/cardio', icon: 'activity', key: 'cardio' },
      { to: '/workout/library', icon: 'list', key: 'exerciseLibrary' },
    ],
  },
  {
    group: 'groupTrack',
    items: [
      { to: '/progress', icon: 'chart', key: 'progress' },
      { to: '/progress/measurements', icon: 'ruler', key: 'measurements' },
      { to: '/history', icon: 'calendar', key: 'history' },
    ],
  },
  {
    group: 'groupCoach',
    items: [
      { to: '/messages', icon: 'chat', key: 'inbox', badge: 'clientUnread' },
      { to: '/check-ins', icon: 'check', key: 'checkins' },
      { to: '/coach-notes', icon: 'info', key: 'coachNotes' },
    ],
  },
  {
    group: 'groupYou',
    items: [
      { to: '/settings/subscription', icon: 'shield', key: 'subscription' },
      { to: '/settings', icon: 'user', key: 'settings' },
    ],
  },
];

/**
 * Coach bottom bar (mobile) — matches the design's exact tab set: Dashboard /
 * Clients / Inbox / Revenue ("Business"). The design's 5th tab ("More") isn't
 * a separate destination here — the brand bar's hamburger menu (present for
 * every role) already opens the full grouped destination list (COACH_SIDEBAR),
 * same as the client shell.
 */
export const COACH_NAV: NavItem[] = [
  { to: '/coach/dashboard', icon: 'home', key: 'coachDashboard' },
  { to: '/coach/clients', icon: 'user', key: 'coachClients' },
  { to: '/coach/messages', icon: 'chat', key: 'coachMessages' },
  { to: '/coach/revenue', icon: 'bolt', key: 'coachRevenue' },
];

/**
 * Every coach destination, grouped exactly like the design's nav rail (Today /
 * Coaching / Content / Business) — used for the desktop sidebar AND the mobile
 * "Navigate" menu sheet. Real destinations beyond the design's 8-item rail
 * (Assessments, Adherence, Client Plans, My Plan) are folded into the group
 * they naturally belong with, plus a trailing "You" group for account/settings
 * (the design reaches these via its own account chrome, which this app doesn't
 * have yet — a bottom group is the real equivalent).
 */
export const COACH_SIDEBAR: NavGroup[] = [
  {
    group: 'groupToday',
    items: [
      { to: '/coach/dashboard', icon: 'home', key: 'coachDashboard' },
      { to: '/coach/messages', icon: 'chat', key: 'coachMessages' },
    ],
  },
  {
    group: 'groupCoaching',
    items: [
      { to: '/coach/clients', icon: 'user', key: 'coachClients' },
      { to: '/coach/checkins', icon: 'check', key: 'coachCheckins' },
      { to: '/coach/assessments', icon: 'list', key: 'coachAssessments' },
      { to: '/coach/adherence', icon: 'target', key: 'coachAdherence' },
    ],
  },
  {
    group: 'groupContent',
    items: [
      { to: '/coach/templates', icon: 'list', key: 'coachTemplates' },
      { to: '/coach/library', icon: 'dumbbell', key: 'coachLibrary' },
    ],
  },
  {
    group: 'groupBusiness',
    items: [
      { to: '/coach/revenue', icon: 'bolt', key: 'coachRevenue' },
      { to: '/coach/reports', icon: 'chart', key: 'coachReports' },
      { to: '/coach/subscription-plans', icon: 'calendar', key: 'coachSubscriptionPlans' },
    ],
  },
  {
    group: 'groupYou',
    items: [
      { to: '/coach/plan', icon: 'shield', key: 'coachPlan' },
      { to: '/coach/settings', icon: 'settings', key: 'coachSettings' },
    ],
  },
];

/** Shared by admin and super_admin; super-admin-only screens are gated inside. */
export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', icon: 'chart', key: 'adminOverview', end: true },
  { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
  { to: '/admin/members', icon: 'user', key: 'adminMembers' },
  { to: '/admin/banners', icon: 'bolt', key: 'adminBanners' },
  { to: '/admin/assignments', icon: 'target', key: 'adminAssignments' },
  { to: '/admin/governance', icon: 'settings', key: 'adminGovernance' },
  { to: '/admin/analytics', icon: 'bolt', key: 'adminAnalytics' },
];

/** Super admin gets an extra Media/Images tab (oversight of all uploads). */
export const SUPER_ADMIN_NAV: NavItem[] = [
  ...ADMIN_NAV,
  { to: '/admin/coaches', icon: 'trophy', key: 'adminCoaches' },
  { to: '/admin/plans', icon: 'list', key: 'adminPlans' },
  { to: '/admin/media', icon: 'image', key: 'adminImages' },
];

export const NAV: Record<Role, NavItem[]> = {
  client: CLIENT_NAV,
  coach: COACH_NAV,
  admin: ADMIN_NAV,
  super_admin: SUPER_ADMIN_NAV,
};
