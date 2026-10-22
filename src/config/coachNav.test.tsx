import { describe, expect, it } from 'vitest';
import { COACH_ME, COACH_TABS, coachAreaFor, coachPageOwnsBack, coachRailGroups, coachShellShowsBack, coachTabFor, isCoachRoot } from './coachNav';
import { semanticParent } from '@/lib/navContract';

/** B3.1 coach IA: Today · Clients · Messages · Library, Me behind the avatar (blueprint §5, O-2). */
describe('coach destinations', () => {
  it('four tabs, all coach routes, in the approved order', () => {
    expect(COACH_TABS.map((t) => t.key)).toEqual(['today', 'clients', 'messages', 'library']);
    expect(COACH_TABS.map((t) => t.to)).toEqual(['/coach/dashboard', '/coach/clients', '/coach/messages', '/coach/library']);
  });

  it('every coach screen lights exactly the destination it belongs to (NAV-K11)', () => {
    const cases: [string, string | null][] = [
      ['/coach/dashboard', 'today'],
      ['/coach/dashboard?tab=clients', 'today'],
      ['/coach/dashboard?focus=checkin', 'today'],
      ['/coach/clients?view=checkins', 'clients'],
      // B3.2: these two redirect to Today before rendering, so they light nothing themselves.
      ['/coach/assessments', null],
      ['/coach/notifications', null],
      ['/coach/clients', 'clients'],
      ['/coach/clients?new=1', 'clients'],
      ['/coach/client/c1', 'clients'],
      ['/coach/client/c1/workout', 'clients'],
      ['/coach/client/c1/view/progress', 'clients'],
      ['/coach/client/c1/versions/workout', 'clients'],
      ['/coach/clients?sort=workouts', 'clients'],
      // B3.3: these two redirect into Clients before rendering.
      ['/coach/checkins', null],
      ['/coach/adherence', null],
      ['/coach/messages', 'messages'],
      ['/coach/messages/c1', 'messages'],
      ['/coach/library', 'library'],
      ['/coach/library?tab=foods', 'library'],
      ['/coach/templates', 'library'],
      ['/coach/templates/t1/edit', 'library'],
      ['/coach/me', null],
      ['/coach/plan', null],
      ['/coach/settings', null],
      ['/coach/revenue', null],
      ['/coach/business', null],
    ];
    for (const [path, tab] of cases) expect(coachTabFor(path), path).toBe(tab);
    for (const path of ['/coach/me', '/coach/business', '/coach/plan', '/coach/settings', '/coach/revenue', '/coach/reports', '/coach/subscription-plans']) {
      expect(coachAreaFor(path), path).toBe('me');
    }
    // A prefix is a whole segment: '/coach/clientsX' is not Clients.
    expect(coachTabFor('/coach/clientsX')).toBeNull();
  });

  it('roots have no Back; pages that draw their own Back never get a second one (NAV-K02)', () => {
    for (const root of [...COACH_TABS.map((t) => t.to), COACH_ME]) {
      expect(isCoachRoot(root)).toBe(true);
      expect(coachShellShowsBack(root)).toBe(false);
    }
    for (const own of ['/coach/client/c1', '/coach/client/c1/workout', '/coach/messages/c1', '/coach/templates/t1', '/coach/templates/new', '/coach/templates/t1/edit']) {
      expect(coachPageOwnsBack(own), own).toBe(true);
      expect(coachShellShowsBack(own), own).toBe(false);
    }
    for (const sub of ['/coach/business', '/coach/plan', '/coach/settings', '/coach/revenue', '/coach/reports', '/coach/subscription-plans', '/coach/templates']) {
      expect(coachShellShowsBack(sub), sub).toBe(true);
    }
  });

  it("the shell's Back from a cold deep link goes up the IA, never out of it", () => {
    expect(semanticParent('/coach/plan', 'coach')).toBe('/coach/me');
    expect(semanticParent('/coach/me', 'coach')).toBe('/coach/dashboard');
    expect(semanticParent('/coach/templates', 'coach')).toBe('/coach/library?tab=programs'); // B3.7: Library › Programs
    expect(semanticParent('/coach/reports', 'coach')).toBe('/coach/me');
    expect(semanticParent('/coach/business', 'coach')).toBe('/coach/me'); // B3.8: Me › Business
  });
});

describe('desktop sidebar groups (B3.8 completion, owner decision 7)', () => {
  const lit = (path: string, search = '') => coachRailGroups(path, search).flatMap((g) => g.links.filter((l) => l.active).map((l) => l.key));
  const subs = (path: string, search = '') => coachRailGroups(path, search).flatMap((g) => g.links.flatMap((l) => (l.children ?? []).map((c) => `${l.key}:${c.key}${c.current ? '*' : ''}`)));

  it('four always-visible groups, in order, over existing routes only', () => {
    const groups = coachRailGroups('/coach/dashboard', '');
    expect(groups.map((g) => [g.key, g.links.map((l) => l.key)])).toEqual([
      ['workspace', ['today', 'clients', 'messages']],
      ['content', ['library']],
      ['business', ['business']],
      ['account', ['forma', 'account']],
    ]);
    expect(groups.flatMap((g) => g.links.map((l) => l.to))).toEqual(['/coach/dashboard', '/coach/clients', '/coach/messages', '/coach/library', '/coach/business', '/coach/plan', '/coach/settings']);
  });

  it('exactly one section is lit for every coach screen', () => {
    expect(lit('/coach/client/x/notes')).toEqual(['clients']);
    expect(lit('/coach/templates/t1')).toEqual(['library']);
    expect(lit('/coach/business', '?tab=renewals')).toEqual(['business']);
    expect(lit('/coach/plan')).toEqual(['forma']);
    expect(lit('/coach/settings')).toEqual(['account']);
    expect(lit('/coach/me')).toEqual([]); // the Me hub lights the footer
  });

  it('a section shows its own pages only while you are in it, with the one on screen marked', () => {
    expect(subs('/coach/dashboard')).toEqual([]);
    expect(subs('/coach/library', '?tab=exercises')).toEqual(['library:programs', 'library:exercises*', 'library:foods', 'library:supplements', 'library:groups']);
    expect(subs('/coach/library', '?tab=foods&view=groups').filter((x) => x.endsWith('*'))).toEqual(['library:groups*']);
    expect(subs('/coach/library', '?tab=groups').filter((x) => x.endsWith('*'))).toEqual(['library:groups*']); // the legacy URL
    expect(subs('/coach/templates/new').filter((x) => x.endsWith('*'))).toEqual(['library:programs*']);
    expect(subs('/coach/business')).toEqual(['business:overview*', 'business:renewals', 'business:packages', 'business:exports']);
    expect(subs('/coach/business', '?tab=exports').filter((x) => x.endsWith('*'))).toEqual(['business:exports*']);
  });

  it('sub-pages link to the same URLs the in-page tabs use', () => {
    const lib = coachRailGroups('/coach/library', '').find((g) => g.key === 'content')!.links[0].children!;
    expect(lib.map((c) => c.to)).toEqual(['/coach/library?tab=programs', '/coach/library?tab=exercises', '/coach/library?tab=foods', '/coach/library?tab=supplements', '/coach/library?tab=foods&view=groups']);
    const biz = coachRailGroups('/coach/business', '').find((g) => g.key === 'business')!.links[0].children!;
    expect(biz.map((c) => c.to)).toEqual(['/coach/business', '/coach/business?tab=renewals', '/coach/business?tab=packages', '/coach/business?tab=exports']);
  });
});
