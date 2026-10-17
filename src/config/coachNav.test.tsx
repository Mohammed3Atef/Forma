import { describe, expect, it } from 'vitest';
import { COACH_ME, COACH_TABS, coachAreaFor, coachPageOwnsBack, coachShellShowsBack, coachTabFor, isCoachRoot } from './coachNav';
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
      ['/coach/checkins', 'today'],
      // B3.2: these two redirect to Today before rendering, so they light nothing themselves.
      ['/coach/assessments', null],
      ['/coach/notifications', null],
      ['/coach/clients', 'clients'],
      ['/coach/clients?new=1', 'clients'],
      ['/coach/client/c1', 'clients'],
      ['/coach/client/c1/workout', 'clients'],
      ['/coach/client/c1/view/progress', 'clients'],
      ['/coach/client/c1/versions/workout', 'clients'],
      ['/coach/adherence', 'clients'],
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
    ];
    for (const [path, tab] of cases) expect(coachTabFor(path), path).toBe(tab);
    for (const path of ['/coach/me', '/coach/plan', '/coach/settings', '/coach/revenue', '/coach/reports', '/coach/subscription-plans']) {
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
    for (const sub of ['/coach/plan', '/coach/settings', '/coach/revenue', '/coach/reports', '/coach/subscription-plans', '/coach/checkins', '/coach/adherence', '/coach/templates']) {
      expect(coachShellShowsBack(sub), sub).toBe(true);
    }
  });

  it("the shell's Back from a cold deep link goes up the IA, never out of it", () => {
    expect(semanticParent('/coach/plan', 'coach')).toBe('/coach/me');
    expect(semanticParent('/coach/me', 'coach')).toBe('/coach/dashboard');
    expect(semanticParent('/coach/templates', 'coach')).toBe('/coach/library');
    expect(semanticParent('/coach/checkins', 'coach')).toBe('/coach/dashboard');
  });
});
