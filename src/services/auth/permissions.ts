import { useSession } from './sessionStore';
import { ROLE_PERMISSIONS } from './roles';
import type { Permission, Role, UserRecord } from '@/types';

/**
 * Permission helpers. Effective permissions = the role baseline plus any extra
 * grants on the account. `super_admin` short-circuits to true. Only active
 * accounts have any permissions at all.
 *
 * This gates UI visibility only — Firestore rules enforce the real boundary.
 */

export function effectivePermissions(account: UserRecord | null): Set<Permission> {
  if (!account || account.accountStatus !== 'active') return new Set();
  return new Set([...(ROLE_PERMISSIONS[account.role] ?? []), ...account.permissions]);
}

export function can(account: UserRecord | null, perm: Permission): boolean {
  if (!account || account.accountStatus !== 'active') return false;
  if (account.role === 'super_admin') return true;
  return effectivePermissions(account).has(perm);
}

/** Reactive hook: re-renders when the current account's permissions change. */
export function useCan(perm: Permission): boolean {
  const account = useSession((s) => s.account);
  return can(account, perm);
}

/** Reactive hook for a per-user feature flag. */
export function useFlag(flag: string): boolean {
  const account = useSession((s) => s.account);
  return account?.featureFlags?.[flag] ?? false;
}

/** Reactive hook for the current role (null when not signed in). */
export function useRole(): Role | null {
  return useSession((s) => s.account?.role ?? null);
}
