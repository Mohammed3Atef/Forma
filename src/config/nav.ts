import type { IconName } from '@/components/Icon';

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
 * Admin bottom bar (mobile) — the design's tab set: Overview / Accounts /
 * <money> / Governance. The money tab differs by role: `/admin/subscriptions`
 * (coach plans + MRR) is backed by super_admin-only procedures
 * (`adminCoaches.list`, `coachPlanRequests.listPending`), so a plain admin
 * gets Analytics (users.read) there instead of a tab that can only spin. The
 * other super-admin destinations (Coaches, Plans, Media) live in the grouped
 * sidebar/"Navigate" sheet only, same lean-bar convention as client/coach.
 */
export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', icon: 'chart', key: 'adminOverview', end: true },
  { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
  { to: '/admin/analytics', icon: 'bolt', key: 'adminAnalytics' },
  { to: '/admin/governance', icon: 'shield', key: 'adminGovernance' },
];
export const SUPER_ADMIN_NAV: NavItem[] = [
  { to: '/admin', icon: 'chart', key: 'adminOverview', end: true },
  { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
  { to: '/admin/subscriptions', icon: 'bolt', key: 'adminSubscriptions' },
  { to: '/admin/governance', icon: 'shield', key: 'adminGovernance' },
];

const ADMIN_GROUP_MONITOR: NavGroup = {
  group: 'groupMonitor',
  items: [
    { to: '/admin', icon: 'chart', key: 'adminOverview', end: true },
    { to: '/admin/analytics', icon: 'bolt', key: 'adminAnalytics' },
  ],
};
const ADMIN_GROUP_GOVERN_ITEMS: NavItem[] = [
  { to: '/admin/governance', icon: 'shield', key: 'adminGovernance' },
  { to: '/admin/audit', icon: 'list', key: 'adminAudit' },
  { to: '/admin/banners', icon: 'image', key: 'adminBanners' },
];
const ADMIN_GROUP_YOU: NavGroup = {
  group: 'groupYou',
  items: [{ to: '/admin/settings', icon: 'settings', key: 'adminSettings' }],
};

/**
 * Every admin destination, grouped like the design's nav rail (Monitor /
 * Manage / Govern / You). Regular admins don't get the super-admin-only
 * items (Coaches, Plans, Subscriptions, Media) — see `SUPER_ADMIN_SIDEBAR`;
 * every destination listed here is backed by procedures a plain admin's
 * permissions (api/_lib/rbac.ts) actually allow.
 */
export const ADMIN_SIDEBAR: NavGroup[] = [
  ADMIN_GROUP_MONITOR,
  {
    group: 'groupManage',
    items: [
      { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
      { to: '/admin/members', icon: 'user', key: 'adminMembers' },
      { to: '/admin/assignments', icon: 'target', key: 'adminAssignments' },
    ],
  },
  { group: 'groupGovern', items: ADMIN_GROUP_GOVERN_ITEMS },
  ADMIN_GROUP_YOU,
];

/** Super admin: the same groups plus Monetise, with Coaches/Plans/Subscriptions/Media folded in. */
export const SUPER_ADMIN_SIDEBAR: NavGroup[] = [
  ADMIN_GROUP_MONITOR,
  {
    group: 'groupManage',
    items: [
      { to: '/admin/coaches', icon: 'trophy', key: 'adminCoaches' },
      { to: '/admin/accounts', icon: 'user', key: 'adminAccounts' },
      { to: '/admin/members', icon: 'user', key: 'adminMembers' },
      { to: '/admin/assignments', icon: 'target', key: 'adminAssignments' },
    ],
  },
  {
    group: 'groupMonetise',
    items: [
      { to: '/admin/plans', icon: 'list', key: 'adminPlans' },
      { to: '/admin/subscriptions', icon: 'bolt', key: 'adminSubscriptions' },
    ],
  },
  { group: 'groupGovern', items: [...ADMIN_GROUP_GOVERN_ITEMS, { to: '/admin/media', icon: 'image', key: 'adminImages' }] },
  ADMIN_GROUP_YOU,
];
