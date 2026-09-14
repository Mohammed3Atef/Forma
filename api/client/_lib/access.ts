import { TRPCError } from '@trpc/server';
import { hasPermission } from '../../_lib/rbac.js';
import type { AuthedUser } from '../../_trpc/context.js';
import { coachClientsCol } from './db.js';

/**
 * Every function here is a direct port of one clause from `firestore.rules`'
 * `clientData/{clientId}/**` section. Keep this file's shape mirroring that
 * section 1:1 — see the comment on each function for the exact rule it ports.
 */

/** Mirrors `isAssignedCoach(clientId)`: an ACTIVE coach with an ACTIVE relationship doc. */
export async function isAssignedCoachOf(user: AuthedUser, clientId: string): Promise<boolean> {
  if (user.role !== 'coach' || user.accountStatus !== 'active') return false;
  const col = await coachClientsCol();
  const rel = await col.findOne({ _id: `${user.id}__${clientId}` });
  return !!rel && rel.status === 'active';
}

function permOk(user: AuthedUser, perm: 'clients.readAll' | 'clients.writeAll'): boolean {
  return hasPermission(user.role, user.accountStatus, user.permissions, perm);
}

export function hasClientsReadAll(user: AuthedUser): boolean {
  return permOk(user, 'clients.readAll');
}

export function hasClientsWriteAll(user: AuthedUser): boolean {
  return permOk(user, 'clients.writeAll');
}

/**
 * Mirrors `match /clientData/{clientId}/{document=**} { allow read: ... }` —
 * the recursive read rule that covers every subcollection: self (NO active-
 * status requirement — a suspended/pending client can still read their own
 * data, exactly like the rule), the assigned coach, or clients.readAll.
 */
export async function canReadClientData(user: AuthedUser, clientId: string): Promise<boolean> {
  if (user.id === clientId) return true;
  if (await isAssignedCoachOf(user, clientId)) return true;
  return hasClientsReadAll(user);
}

/**
 * Mirrors the generic client-own write clause: `isActive() && auth.uid == clientId`.
 * Used by every collection that ISN'T in `isCoachOwnedColl` (settings, raw logs,
 * measurementLogs, notifications, subscriptionRequest, profile/main).
 */
export function isActiveSelf(user: AuthedUser, clientId: string): boolean {
  return user.accountStatus === 'active' && user.id === clientId;
}

/**
 * Mirrors the coach/admin write clause used for `isCoachOwnedColl` collections
 * (plan, coachNotes, coachTargets, planVersions, checkIns) — never the client.
 */
export async function canWriteCoachOwned(user: AuthedUser, clientId: string): Promise<boolean> {
  if (await isAssignedCoachOf(user, clientId)) return true;
  return hasClientsWriteAll(user);
}

/**
 * Mirrors the measurementLogs/notifications dedicated rule, which ADDS coach/
 * admin write on top of the generic client-own write (neither collection is
 * coach-owned, so the client keeps their normal write too).
 */
export async function canWriteClientOrCoach(user: AuthedUser, clientId: string): Promise<boolean> {
  if (isActiveSelf(user, clientId)) return true;
  return canWriteCoachOwned(user, clientId);
}

/**
 * Resolves the target clientId for a call: an explicit `clientId` input field
 * (coach/admin acting on a client), or the caller's own id when they are a
 * client. Throws BAD_REQUEST if neither is available.
 */
export function resolveClientId(inputClientId: string | undefined, user: AuthedUser): string {
  const clientId = inputClientId ?? (user.role === 'client' ? user.id : undefined);
  if (!clientId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'clientId is required' });
  return clientId;
}
