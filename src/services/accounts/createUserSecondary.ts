import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/data/adapters/firebase/config';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import type { AccountStatus, Permission, Role, UserRecord } from '@/types';

export interface CreateAccountParams {
  email: string;
  password: string;
  displayName?: string;
  role: Role;
  accountStatus?: AccountStatus;
  permissions?: Permission[];
  createdBy: string;
  assignedCoachId?: string;
}

/**
 * Creates a new account on behalf of an admin WITHOUT signing the admin out.
 *
 * Firebase's `createUserWithEmailAndPassword` signs the new user into the auth
 * instance it's called on — which would clobber the admin's session. With no
 * Cloud Functions / Admin SDK available, we mint the auth user on a throwaway
 * secondary Firebase app (in-memory persistence so it never touches the shared
 * session store), then write the identity doc from the PRIMARY app's db — i.e.
 * the admin's authenticated context, which the security rules require in order
 * to set a non-default role.
 */
export async function createAccount(params: CreateAccountParams): Promise<UserRecord> {
  const { email, password, displayName, role, accountStatus, permissions, createdBy, assignedCoachId } = params;
  const cfg = {
    apiKey: firebaseConfig.apiKey!,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId!,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  };
  const secondary = initializeApp(cfg, `forma-admin-create-${Date.now()}`);
  try {
    const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    const now = Date.now();
    const record: UserRecord = {
      id: uid,
      email,
      displayName: displayName?.trim() || email.split('@')[0],
      role,
      accountStatus: accountStatus ?? 'active',
      permissions: permissions ?? [],
      featureFlags: {},
      createdBy,
      ...(assignedCoachId ? { assignedCoachId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    const { db } = ensureFirebase(); // primary (admin) context — rules vet this write
    try {
      await setDoc(doc(db, 'users', uid), record);
    } catch (e) {
      // The auth account exists but the identity doc was rejected (e.g. rules).
      // Delete the just-created auth user so we don't leave an orphan, then
      // surface the original error to the caller.
      await cred.user.delete().catch(() => undefined);
      throw e;
    }
    await signOut(secondaryAuth);
    return record;
  } finally {
    await deleteApp(secondary);
  }
}
