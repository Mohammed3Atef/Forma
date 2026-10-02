import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, ADMIN_SIDEBAR, COACH_NAV, COACH_SIDEBAR, SUPER_ADMIN_NAV, SUPER_ADMIN_SIDEBAR, type NavGroup } from './nav';

/**
 * Role-based navigation contract (Phase 2 finding R-1): a plain admin must
 * never be OFFERED a destination whose backing tRPC procedures are
 * super_admin-only — those screens redirect to /admin, so the tab would be a
 * dead end (or, before the fix, a permanent spinner on a bottom-nav tab).
 */
const SUPER_ONLY_ROUTES = ['/admin/coaches', '/admin/plans', '/admin/subscriptions', '/admin/media'];
const flatten = (groups: NavGroup[]) => groups.flatMap((g) => g.items.map((i) => i.to));

describe('admin navigation is role-scoped', () => {
  it('plain admin bottom bar and sidebar contain no super_admin-only destination', () => {
    for (const to of [...ADMIN_NAV.map((i) => i.to), ...flatten(ADMIN_SIDEBAR)]) {
      expect(SUPER_ONLY_ROUTES).not.toContain(to);
    }
    // …but still every admin-reachable core destination.
    expect(flatten(ADMIN_SIDEBAR)).toEqual(expect.arrayContaining(['/admin', '/admin/accounts', '/admin/members', '/admin/assignments', '/admin/governance', '/admin/audit', '/admin/banners', '/admin/analytics', '/admin/settings']));
    expect(ADMIN_NAV.map((i) => i.to)).toEqual(['/admin', '/admin/accounts', '/admin/analytics', '/admin/governance']);
  });

  it('super admin gets the money tab and every super-only destination in the sidebar', () => {
    expect(SUPER_ADMIN_NAV.map((i) => i.to)).toContain('/admin/subscriptions');
    for (const to of SUPER_ONLY_ROUTES) expect(flatten(SUPER_ADMIN_SIDEBAR)).toContain(to);
    // Everything a plain admin can reach, a super admin can reach too.
    for (const to of flatten(ADMIN_SIDEBAR)) expect(flatten(SUPER_ADMIN_SIDEBAR)).toContain(to);
  });

  it('coach nav only points at coach routes and every bottom tab is also in the sidebar', () => {
    const sidebar = flatten(COACH_SIDEBAR);
    for (const item of COACH_NAV) {
      expect(item.to.startsWith('/coach/')).toBe(true);
      expect(sidebar).toContain(item.to);
    }
  });
});
