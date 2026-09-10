import type { AccountStatus, Permission, Role } from './types';

/**
 * Backend copy of `src/services/auth/roles.ts`'s permission table. This is
 * now the REAL enforcement point (unlike the frontend copy, which only hides
 * UI) — every route that needs a permission check calls `requirePermission`
 * (see `./withAuth`), which calls `hasPermission` below. Keep both files in
 * sync by hand, same discipline as roles.ts ↔ firestore.rules today.
 */

export const ALL_PERMISSIONS: Permission[] = [
  'users.read',
  'users.create',
  'users.manageRoles',
  'users.manageStatus',
  'coaches.assign',
  'clients.readAll',
  'clients.writeAll',
  'flags.manage',
  'audit.read',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [
    'users.read',
    'users.create',
    'users.manageRoles',
    'users.manageStatus',
    'coaches.assign',
    'clients.readAll',
    'flags.manage',
    'audit.read',
  ],
  coach: ['users.read'],
  client: [],
};

export function effectivePermissions(role: Role, status: AccountStatus, extra: Permission[]): Set<Permission> {
  if (status !== 'active') return new Set();
  return new Set([...(ROLE_PERMISSIONS[role] ?? []), ...extra]);
}

export function hasPermission(role: Role, status: AccountStatus, extra: Permission[], perm: Permission): boolean {
  if (status !== 'active') return false;
  if (role === 'super_admin') return true;
  return effectivePermissions(role, status, extra).has(perm);
}
