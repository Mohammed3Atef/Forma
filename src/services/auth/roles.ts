import type { AccountStatus, Permission, Role } from '@/types';

/**
 * Role → permission model for the Forma platform.
 *
 * These baselines are the single source of truth on the frontend and are
 * mirrored (by hand) in firestore.rules — keep the two in sync. The frontend
 * only HIDES UI based on this table; the backend rules are what actually
 * enforce access.
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
  // super_admin is all-powerful; `can()` short-circuits to true for it, but we
  // also list the full set here so UI that enumerates permissions is correct.
  super_admin: [...ALL_PERMISSIONS],
  // Admins manage people and read oversight data, but do not author client
  // plans by default (grant 'clients.writeAll' explicitly if needed) and cannot
  // promote anyone to admin/super_admin (enforced in rules).
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
  // Coaches can look people up; access to their own clients' data is granted by
  // the coach⇄client relationship (rules), not a blanket permission.
  coach: ['users.read'],
  client: [],
};

/**
 * Status assigned to brand-new self-service sign-ups. Defaults to 'pending'
 * (gated onboarding — the account cannot write cloud data until an admin
 * activates it). Change to 'active' to allow open self-serve registration.
 */
export const SELF_SIGNUP_STATUS: AccountStatus = 'pending';

/** Landing route for each role after authentication. */
export function homeFor(role: Role | null | undefined): string {
  switch (role) {
    case 'coach':
      return '/coach';
    case 'admin':
    case 'super_admin':
      return '/admin';
    default:
      return '/';
  }
}
