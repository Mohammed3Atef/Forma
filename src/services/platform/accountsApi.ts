import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/services/platformApi';
import type { AccountStatus, Permission, Role, UserRecord } from '@/types';

/** Params for `createUser` — an admin/coach provisioning a new account server-side. */
export interface CreateAccountParams {
  email: string;
  password: string;
  displayName?: string;
  phone?: string;
  role: Role;
  accountStatus?: AccountStatus;
  permissions?: Permission[];
  createdBy: string;
  assignedCoachId?: string;
}

export interface UserPage {
  users: UserRecord[];
  /** Opaque pagination cursor returned by `/api/admin/users` (an encoded `createdAt:id` string), or `null` on the last page. */
  cursor: string | null;
}

/**
 * One page of accounts, newest first. Role/status/text filtering is applied
 * client-side over the loaded pages, matching the pre-migration behavior.
 */
export async function fetchUsersPage(pageSize = 25, after?: string | null): Promise<UserPage> {
  const qs = new URLSearchParams({ pageSize: String(pageSize) });
  if (after != null) qs.set('cursor', after);
  return apiGet<UserPage>(`/admin/users?${qs.toString()}`);
}

export async function fetchUser(uid: string): Promise<UserRecord | null> {
  try {
    return await apiGet<UserRecord>(`/admin/users/${encodeURIComponent(uid)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** All accounts of a given role (for pickers; capped — paginate later if needed). */
export async function fetchByRole(role: Role, max = 200): Promise<UserRecord[]> {
  return apiGet<UserRecord[]>(`/admin/users/by-role?role=${encodeURIComponent(role)}&max=${max}`);
}

/**
 * Find existing CLIENT accounts by exact email, exact phone, or name prefix
 * (case-insensitive via `displayNameLower`) — for "Add Existing Client".
 * Matching now happens server-side in one request; never creates anything.
 */
export async function searchClients(value: string, max = 20): Promise<UserRecord[]> {
  const v = value.trim();
  if (!v) return [];
  return apiGet<UserRecord[]>(`/admin/users/search-clients?value=${encodeURIComponent(v)}&max=${max}`);
}

/** Provisions a new account (admin-driven); the API records the audit entry. */
export async function createUser(params: CreateAccountParams): Promise<UserRecord> {
  return apiPost<UserRecord>('/admin/users', params);
}

export async function setAccountStatus(target: UserRecord, status: AccountStatus): Promise<void> {
  await apiPatch(`/admin/users/${encodeURIComponent(target.id)}/status`, { status });
}

/** Outcome of a bulk operation: how many docs succeeded vs. failed. */
export interface BulkResult {
  ok: number;
  failed: number;
}

/**
 * Apply a status to many accounts in one request. The API applies each target
 * independently (one audit entry per account; a failure on one never aborts
 * the rest) and returns a success/fail tally so the UI can surface partial
 * failures.
 */
export async function bulkSetAccountStatus(targets: UserRecord[], status: AccountStatus): Promise<BulkResult> {
  return apiPost<BulkResult>('/admin/users/bulk-status', { targetIds: targets.map((t) => t.id), status });
}

/**
 * Hard-deletes the account (super-admin only, per the API's own role check).
 * Prefer `accountStatus: 'disabled'` for reversible deactivation; use delete
 * only to purge a record entirely.
 */
export async function deleteUser(target: UserRecord): Promise<void> {
  await apiDelete(`/admin/users/${encodeURIComponent(target.id)}`);
}

export async function setRole(target: UserRecord, role: Role): Promise<void> {
  await apiPatch(`/admin/users/${encodeURIComponent(target.id)}/role`, { role });
}

export async function setPermissions(target: UserRecord, permissions: Permission[]): Promise<void> {
  await apiPatch(`/admin/users/${encodeURIComponent(target.id)}/permissions`, { permissions });
}
