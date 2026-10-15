import type { IconName } from '@/components/Icon';

/**
 * Client information architecture (B2, doc 16): five equal tabs, "You" behind
 * the avatar. One route map decides which tab is lit, which screens are tab
 * roots (no Back) and which are full-screen task flows (no global nav) — every
 * client screen belongs to exactly one destination.
 */
export type ClientTab = 'today' | 'train' | 'nutrition' | 'progress' | 'coach';

export interface ClientTabDef {
  key: ClientTab;
  to: string;
  icon: IconName;
  /** i18n key of the label. */
  label: string;
}

export const CLIENT_TABS: ClientTabDef[] = [
  { key: 'today', to: '/', icon: 'home', label: 'nav.today' },
  { key: 'train', to: '/workout', icon: 'dumbbell', label: 'nav.train' },
  { key: 'nutrition', to: '/nutrition', icon: 'meal', label: 'nav.nutrition' },
  { key: 'progress', to: '/progress', icon: 'chart', label: 'nav.progress' },
  { key: 'coach', to: '/messages', icon: 'chat', label: 'nav.coach' },
];

/** Route prefix → tab (most specific first). */
const TAB_OF: [prefix: string, tab: ClientTab][] = [
  ['/workout', 'train'],
  ['/cardio', 'train'],
  ['/history', 'train'],
  ['/nutrition', 'nutrition'],
  ['/progress', 'progress'],
  ['/messages', 'coach'],
  ['/coach-notes', 'coach'],
  ['/check-ins', 'coach'],
  ['/check-in/', 'coach'],
  ['/assessment', 'coach'],
  ['/notifications', 'coach'],
];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/** The tab lit for a pathname (null for You / account screens). */
export function clientTabFor(pathname: string): ClientTab | null {
  if (pathname === '/' || pathname === '') return 'today';
  for (const [prefix, tab] of TAB_OF) if (under(pathname, prefix)) return tab;
  return null;
}

/** The Coach tab's sections (Chat · Updates · Check-ins) are peers switched in place. */
export const COACH_SECTIONS = ['/messages', '/coach-notes', '/check-ins'];

/** Tab roots never show Back (NAV-C01); neither do the Coach tab's peer sections. */
export function isClientTabRoot(pathname: string): boolean {
  return CLIENT_TABS.some((t) => t.to === pathname) || COACH_SECTIONS.includes(pathname);
}

/** Full-screen task flows: the global nav, banners and resume bar step aside (doc 17 D8). */
export function isClientTaskFlow(pathname: string): boolean {
  return pathname === '/workout/session' || pathname.startsWith('/check-in/');
}

/** Header title (i18n key) for screens whose title is not their own content. */
export function clientTitleFor(pathname: string): string | null {
  const exact: Record<string, string> = {
    '/': 'nav.today',
    '/workout': 'nav.train',
    '/nutrition': 'nav.nutrition',
    '/progress': 'nav.progress',
    '/messages': 'nav.coach',
    '/coach-notes': 'nav.coach',
    '/check-ins': 'nav.coach',
    '/assessment': 'nav.assessment',
    '/cardio': 'nav.cardio',
    '/history': 'nav.history',
    '/progress/measurements': 'nav.measurements',
    '/settings': 'nav.you',
    '/settings/subscription': 'nav.subscription',
  };
  if (exact[pathname]) return exact[pathname];
  if (pathname.startsWith('/workout/')) return 'nav.train';
  return null;
}
