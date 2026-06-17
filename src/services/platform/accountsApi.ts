import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { createAccount, type CreateAccountParams } from '@/services/accounts/createUserSecondary';
import { writeAudit } from './auditApi';
import type { AccountStatus, Permission, Role, UserRecord } from '@/types';

const USERS = 'users';

export interface UserPage {
  users: UserRecord[];
  cursor: QueryDocumentSnapshot | null;
}

/**
 * One page of accounts, newest first. Role/status/text filtering is applied
 * client-side over the loaded pages (keeps us free of composite indexes at this
 * scale); server-side filtered queries + indexes are a later optimization.
 */
export async function fetchUsersPage(pageSize = 25, after?: QueryDocumentSnapshot | null): Promise<UserPage> {
  const { db } = ensureFirebase();
  const q = after
    ? query(collection(db, USERS), orderBy('createdAt', 'desc'), startAfter(after), limit(pageSize))
    : query(collection(db, USERS), orderBy('createdAt', 'desc'), limit(pageSize));
  const snap = await getDocs(q);
  const users = snap.docs.map((d) => d.data() as UserRecord);
  const cursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null;
  return { users, cursor };
}

export async function fetchUser(uid: string): Promise<UserRecord | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, USERS, uid));
  return snap.exists() ? (snap.data() as UserRecord) : null;
}

/** All accounts of a given role (for pickers; capped — paginate later if needed). */
export async function fetchByRole(role: Role, max = 200): Promise<UserRecord[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, USERS), where('role', '==', role), limit(max)));
  return snap.docs.map((d) => d.data() as UserRecord);
}

/** Provisions a new account (admin-driven) and records an audit entry. */
export async function createUser(params: CreateAccountParams): Promise<UserRecord> {
  const record = await createAccount(params);
  await writeAudit({ action: 'user.create', targetUserId: record.id, metadata: { role: record.role } });
  return record;
}

export async function setAccountStatus(target: UserRecord, status: AccountStatus): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, USERS, target.id), { accountStatus: status, updatedAt: Date.now() });
  await writeAudit({
    action: 'user.updateStatus',
    targetUserId: target.id,
    metadata: { from: target.accountStatus, to: status },
  });
}

/**
 * Hard-deletes the identity doc at `users/{uid}` (super-admin only, per rules).
 * NOTE: this is a client-side SPA — it cannot remove the Firebase Auth user or
 * the client's `clientData/*`; those remain. Prefer `accountStatus: 'disabled'`
 * for reversible deactivation; use delete only to purge a record entirely.
 */
export async function deleteUser(target: UserRecord): Promise<void> {
  const { db } = ensureFirebase();
  await deleteDoc(doc(db, USERS, target.id));
  await writeAudit({ action: 'user.delete', targetUserId: target.id, metadata: { role: target.role, email: target.email } });
}

export async function setRole(target: UserRecord, role: Role): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, USERS, target.id), { role, updatedAt: Date.now() });
  await writeAudit({ action: 'user.updateRole', targetUserId: target.id, metadata: { from: target.role, to: role } });
}

export async function setPermissions(target: UserRecord, permissions: Permission[]): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, USERS, target.id), { permissions, updatedAt: Date.now() });
  await writeAudit({ action: 'user.updatePermissions', targetUserId: target.id, metadata: { permissions } });
}
