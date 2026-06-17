import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { SELF_SIGNUP_STATUS } from '@/services/auth/roles';
import type { UserRecord } from '@/types';

/**
 * Reads and writes of the identity document at `users/{uid}`.
 *
 * This is the access-control record (role, status, permissions, feature flags)
 * — NOT fitness data, which lives under `clientData/{uid}`. The SyncEngine
 * never touches these docs: a client must not be able to set its own role, so
 * all writes here go through code paths the security rules can vet.
 *
 * Phase 1 covers self-provisioning + reads. Admin-driven creation, role/status
 * changes, assignment and audit logging are layered on in later phases.
 */

const USERS = 'users';

export async function fetchUserRecord(uid: string): Promise<UserRecord | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? (snap.data() as UserRecord) : null;
}

/**
 * Ensures an identity doc exists for a freshly signed-up (or pre-RBAC) account,
 * with locked defaults: role `client`, status from {@link SELF_SIGNUP_STATUS},
 * no permissions. Idempotent — returns the existing record if one is present so
 * it never clobbers an admin-assigned role.
 */
export async function provisionSelf(uid: string, email: string, phone?: string): Promise<UserRecord> {
  const existing = await fetchUserRecord(uid);
  if (existing) return existing;

  const now = Date.now();
  const record: UserRecord = {
    id: uid,
    email,
    displayName: email ? email.split('@')[0] : 'Member',
    role: 'client',
    accountStatus: SELF_SIGNUP_STATUS,
    permissions: [],
    featureFlags: {},
    createdBy: 'self',
    ...(phone?.trim() ? { phone: phone.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const { db } = ensureFirebase();
  await setDoc(doc(db, USERS, uid), record);
  return record;
}
