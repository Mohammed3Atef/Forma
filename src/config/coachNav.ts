import type { IconName } from '@/components/Icon';

/**
 * Coach information architecture (B3.1 / blueprint §5, owner O-2): four
 * primary destinations — Today · Clients · Messages · Library — as tabs on
 * phones and a side rail from 768 px, and **Me** behind the avatar (Business,
 * Forma subscription, Account, Help). One route map decides which destination
 * is lit for every coach screen (NAV-K11: a client's workspace lights
 * Clients), which screens are roots (no Back) and which pages still draw their
 * own Back (so the shell never adds a second one — NAV-K02).
 */
export type CoachTab = 'today' | 'clients' | 'messages' | 'library';

export interface CoachTabDef {
  key: CoachTab;
  to: string;
  icon: IconName;
  /** i18n key of the label. */
  label: string;
}

export const COACH_TABS: CoachTabDef[] = [
  { key: 'today', to: '/coach/dashboard', icon: 'home', label: 'coachNav.today' },
  { key: 'clients', to: '/coach/clients', icon: 'users', label: 'coachNav.clients' },
  { key: 'messages', to: '/coach/messages', icon: 'chat', label: 'coachNav.messages' },
  { key: 'library', to: '/coach/library', icon: 'dumbbell', label: 'coachNav.library' },
];

/** The Me hub (behind the avatar / the rail's footer). */
export const COACH_ME = '/coach/me';

/** Route prefix → destination, most specific first. Unlisted coach paths light nothing. */
const AREA_OF: [prefix: string, area: CoachTab | 'me'][] = [
  ['/coach/dashboard', 'today'],
  // (`/coach/assessments` and `/coach/notifications` redirect to Today since B3.2;
  // `/coach/checkins` and `/coach/adherence` redirect into Clients since B3.3.)
  ['/coach/clients', 'clients'],
  ['/coach/client', 'clients'],
  ['/coach/messages', 'messages'],
  ['/coach/library', 'library'],
  ['/coach/templates', 'library'], // Library › Programs (B3.7)
  ['/coach/me', 'me'],
  ['/coach/plan', 'me'],
  ['/coach/settings', 'me'],
  ['/coach/revenue', 'me'],
  ['/coach/reports', 'me'],
  ['/coach/subscription-plans', 'me'],
];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Which destination a coach path belongs to (`me` for the Me area), or null. */
export function coachAreaFor(pathname: string): CoachTab | 'me' | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  for (const [prefix, area] of AREA_OF) if (under(path, prefix)) return area;
  return null;
}

/** The lit tab (null inside Me, which lights the avatar / rail footer instead). */
export function coachTabFor(pathname: string): CoachTab | null {
  const area = coachAreaFor(pathname);
  return area === 'me' ? null : area;
}

/** Roots carry no Back: the four destinations and the Me hub. */
export function isCoachRoot(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '');
  return path === COACH_ME || COACH_TABS.some((t) => t.to === path);
}

/**
 * Screens that still draw their own Back inside the page (the client
 * workspace header and its editors, a message thread, template screens).
 * The shell adds no second Back there; those screens are rebuilt with one
 * header in B3.4 – B3.7.
 */
export function coachPageOwnsBack(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '');
  return (
    under(path, '/coach/client') ||
    /^\/coach\/messages\/[^/]+$/.test(path) ||
    /^\/coach\/templates\/[^/]+(\/edit)?$/.test(path)
  );
}

/** Does the shell's header show a Back for this path? */
export function coachShellShowsBack(pathname: string): boolean {
  return !isCoachRoot(pathname) && !coachPageOwnsBack(pathname);
}
