import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';

/**
 * Thin wrapper over Firebase Auth. Optional — only used when the user opts into
 * cloud backup from Settings. The app's primary identity is the local profile.
 */
export const firebaseAuth = {
  async signUp(email: string, password: string): Promise<User> {
    const { auth } = ensureFirebase();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async signIn(email: string, password: string): Promise<User> {
    const { auth } = ensureFirebase();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async signOutUser(): Promise<void> {
    const { auth } = ensureFirebase();
    await signOut(auth);
  },
  onChange(cb: (user: User | null) => void): () => void {
    const { auth } = ensureFirebase();
    return onAuthStateChanged(auth, cb);
  },
  currentUid(): string | null {
    const { auth } = ensureFirebase();
    return auth.currentUser?.uid ?? null;
  },
};
