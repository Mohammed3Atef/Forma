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
  ['/coach/business', 'me'], // Me › Business (B3.8)
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

// ---- B3.8 completion: the desktop sidebar (owner decision 7) -----------------------------------
// Always-visible groups; a section's own pages (Library segments, Business tabs) appear under it
// only while you are in that section (context-sensitive). Existing routes and `?tab=` URLs only —
// no screen is duplicated. Phones keep the four tabs + the avatar (unchanged).

export type RailGroupKey = 'workspace' | 'content' | 'business' | 'account';

export interface RailLink {
  key: string;
  to: string;
  icon: IconName;
  /** i18n key of the label. */
  label: string;
  /** The section is the one on screen (lights the link). */
  active: boolean;
  /** Sub-pages of an active section; the one on screen is `current`. */
  children?: { key: string; to: string; label: string; current: boolean }[];
}

export interface RailGroup {
  key: RailGroupKey;
  /** i18n key of the group heading. */
  label: string;
  links: RailLink[];
}

const LIBRARY_SUBS = [
  { key: 'programs', label: 'coachLib.tabs.programs' },
  { key: 'exercises', label: 'coachLib.tabs.exercises' },
  { key: 'foods', label: 'coachLib.tabs.foods' },
  { key: 'supplements', label: 'coachLib.tabs.supplements' },
  { key: 'groups', label: 'library.views.groups' },
] as const;
const BUSINESS_SUBS = ['overview', 'renewals', 'packages', 'exports'] as const;

/** The sidebar for a coach location (`pathname` + `search`). Pure — pinned by `coachNav.test.tsx`. */
export function coachRailGroups(pathname: string, search: string): RailGroup[] {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const tab = coachTabFor(path);
  const inLibrary = tab === 'library';
  const inBusiness = under(path, '/coach/business');

  // Library: the segment on screen (`/coach/templates` is Programs; legacy `?tab=groups` is Swap groups).
  const libTab = params.get('tab');
  const libSegment = under(path, '/coach/templates') ? 'programs' : libTab === 'groups' || (libTab === 'foods' && params.get('view') === 'groups') ? 'groups' : (['programs', 'exercises', 'foods', 'supplements'] as string[]).includes(libTab ?? '') ? libTab! : 'programs';
  const bizTab = (BUSINESS_SUBS as readonly string[]).includes(params.get('tab') ?? '') ? params.get('tab')! : 'overview';

  return [
    {
      key: 'workspace',
      label: 'coachNav.groups.workspace',
      links: COACH_TABS.filter((d) => d.key !== 'library').map((d) => ({ key: d.key, to: d.to, icon: d.icon, label: d.label, active: d.key === tab })),
    },
    {
      key: 'content',
      label: 'coachNav.groups.content',
      links: [
        {
          key: 'library',
          to: '/coach/library',
          icon: 'dumbbell',
          label: 'coachNav.library',
          active: inLibrary,
          ...(inLibrary
            ? { children: LIBRARY_SUBS.map((s) => ({ key: s.key, to: s.key === 'groups' ? '/coach/library?tab=foods&view=groups' : `/coach/library?tab=${s.key}`, label: s.label, current: libSegment === s.key })) }
            : {}),
        },
      ],
    },
    {
      key: 'business',
      label: 'coachNav.groups.business',
      links: [
        {
          key: 'business',
          to: '/coach/business',
          icon: 'chart',
          label: 'business.title',
          active: inBusiness,
          ...(inBusiness ? { children: BUSINESS_SUBS.map((k) => ({ key: k, to: k === 'overview' ? '/coach/business' : `/coach/business?tab=${k}`, label: `business.tabs.${k}`, current: bizTab === k })) } : {}),
        },
      ],
    },
    {
      key: 'account',
      label: 'coachNav.groups.account',
      links: [
        { key: 'forma', to: '/coach/plan', icon: 'bolt', label: 'forma.myPlan', active: under(path, '/coach/plan') },
        { key: 'account', to: '/coach/settings', icon: 'settings', label: 'coachMe.accountRow', active: under(path, '/coach/settings') },
      ],
    },
  ];
}
