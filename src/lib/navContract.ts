/**
 * Navigation contract (B1.10). One place that says which paths a role's app
 * owns and where "up" goes from a screen — so Back, deep links and
 * notification taps agree, and a link that arrives from outside the app (a
 * notification row, a `returnTo` in the URL) can never send the user to
 * another origin or into another role's screens.
 */
export type RoleSpace = 'client' | 'coach' | 'admin';

export function roleSpaceOf(role: string | null | undefined): RoleSpace {
  if (role === 'coach') return 'coach';
  if (role === 'admin' || role === 'super_admin') return 'admin';
  return 'client';
}

/** The role's home screen — the last-resort parent of everything. */
export const ROLE_HOME: Record<RoleSpace, string> = { client: '/', coach: '/coach', admin: '/admin' };

/**
 * True for an in-app path owned by `space`: starts with a single "/", has no
 * scheme / host / backslash / control characters, and stays inside that
 * role's screens ("/coach/…" for a coach, "/admin/…" for an admin, anything
 * else for a client).
 */
export function isRolePath(path: unknown, space: RoleSpace): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return false;
  const pathname = path.split(/[?#]/)[0];
  if (pathname.split('/').some((seg) => seg === '..' || seg === '.')) return false;
  const inCoach = pathname === '/coach' || pathname.startsWith('/coach/');
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  if (space === 'coach') return inCoach;
  if (space === 'admin') return inAdmin;
  return !inCoach && !inAdmin;
}

/** A path from outside (URL param, stored route) if it's safe for this role — otherwise the fallback. */
export function safeRolePath(path: unknown, space: RoleSpace, fallback: string = ROLE_HOME[space]): string {
  return isRolePath(path, space) ? path : fallback;
}

/*
 * Semantic parents: where "up" leads from a screen when there is no in-app
 * history to go back to (a cold deep link, a notification tap, a reload).
 * Ordered most-specific first; `:id` captures one segment.
 */
const PARENTS: [pattern: string, parent: string][] = [
  // coach — client workspace and its satellites
  ['/coach/client/:id/versions/:kind', '/coach/client/:id'],
  ['/coach/client/:id/view/:tab', '/coach/client/:id'],
  ['/coach/client/:id/view', '/coach/client/:id'],
  ['/coach/client/:id/:tab', '/coach/client/:id'],
  ['/coach/client/:id', '/coach/clients'],
  ['/coach/messages/:id', '/coach/messages'],
  ['/coach/templates/:id/edit', '/coach/templates/:id'],
  ['/coach/templates/new', '/coach/templates'],
  ['/coach/templates/:id', '/coach/templates'],
  // B3.1 coach IA: Library › Programs; Me (Business, Forma subscription,
  // Account) → Me → Today; every other section → Today.
  ['/coach/templates', '/coach/library'],
  ['/coach/plan', '/coach/me'],
  ['/coach/settings', '/coach/me'],
  ['/coach/revenue', '/coach/me'],
  ['/coach/reports', '/coach/me'],
  ['/coach/subscription-plans', '/coach/me'],
  ['/coach/:section', '/coach/dashboard'],
  // admin
  ['/admin/coaches/:id', '/admin/coaches'],
  ['/admin/clients/:id', '/admin/members'],
  ['/admin/:section', '/admin'],
  // client (B2 IA: Today · Train · Nutrition · Progress · Coach, You via the avatar)
  ['/workout/routine/:id', '/workout'],
  ['/workout/exercise/:id', '/workout'],
  ['/workout/session', '/workout'],
  ['/cardio', '/workout'],
  ['/history', '/workout'],
  ['/progress/measurements', '/progress'],
  ['/check-in/:id', '/check-ins'],
  ['/check-ins', '/messages'],
  ['/coach-notes', '/messages'],
  ['/assessment', '/check-ins'],
  ['/settings/subscription', '/settings'],
  ['/:section', '/'],
];

function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split('/');
  const s = pathname.replace(/\/+$/, '').split('/');
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      if (!s[i]) return null;
      params[p[i].slice(1)] = s[i];
    } else if (p[i] !== s[i]) return null;
  }
  return params;
}

/** Where "up" goes from `pathname` (query/hash ignored); the role home when nothing is above it. */
export function semanticParent(pathname: string, space: RoleSpace): string {
  const path = pathname.split(/[?#]/)[0];
  const home = ROLE_HOME[space];
  if (path === home || path === '') return home;
  for (const [pattern, parent] of PARENTS) {
    const params = match(pattern, path);
    if (!params) continue;
    const resolved = parent.replace(/:(\w+)/g, (_m, k: string) => params[k] ?? '');
    if (resolved !== path && isRolePath(resolved, space)) return resolved;
  }
  return home;
}
