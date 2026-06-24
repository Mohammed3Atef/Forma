import { create } from 'zustand';
import { cloudAvailable } from '@/data/dataSource';
import type { AccountStatus, UserRecord } from '@/types';

/**
 * Session / identity store — the source of truth for "who is signed in and what
 * can they do". Distinct from `useCloud` (which only mirrors the signed-in
 * user's own local-first data to Firestore): this store loads the `users/{uid}`
 * identity doc and drives role-based routing.
 *
 * When Firebase is not configured the app has no platform: we synthesise an
 * active local `client` account so the existing offline PWA runs unchanged.
 */

export type SessionPhase = 'loading' | 'anonymous' | 'pending' | 'suspended' | 'ready';

interface SessionState {
  phase: SessionPhase;
  uid: string | null;
  account: UserRecord | null;
  error: string | null;
  init: () => void;
  /** Resolves true on success; on failure sets `error` and resolves false. */
  signIn: (email: string, password: string, create?: boolean, phone?: string, role?: 'client' | 'coach') => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Re-reads the identity doc for the current uid and recomputes `phase`. */
  refreshAccount: () => Promise<void>;
  /** Update the signed-in user's own contact phone (allowed by self-update rules). */
  updateContact: (phone: string) => Promise<void>;
  /** Patch the signed-in user's own non-control profile fields (name/phone/photo/timezone). */
  updateSelf: (patch: Partial<Pick<UserRecord, 'displayName' | 'phone' | 'photoUrl' | 'timezone'>>) => Promise<void>;
  /** Send a password-reset email (works while signed out). */
  resetPassword: (email: string) => Promise<void>;
  /** Change the signed-in user's password + clear the must-change flag. */
  changePassword: (newPassword: string) => Promise<void>;
}

/** Synthetic account used in local-only mode (no Firebase configured). */
const LOCAL_ACCOUNT: UserRecord = {
  id: 'local-user',
  email: '',
  displayName: 'You',
  role: 'client',
  accountStatus: 'active',
  permissions: [],
  featureFlags: {},
  createdBy: 'self',
  createdAt: 0,
  updatedAt: 0,
};

function phaseForStatus(status: AccountStatus): SessionPhase {
  if (status === 'active') return 'ready';
  if (status === 'pending') return 'pending';
  return 'suspended'; // suspended | disabled
}

/** Guard so init() can be called from React effects (StrictMode re-runs them). */
let initialized = false;

export const useSession = create<SessionState>((set, get) => ({
  phase: 'loading',
  uid: null,
  account: null,
  error: null,

  init() {
    if (initialized) return; // React StrictMode mounts effects twice in dev
    initialized = true;
    if (!cloudAvailable()) {
      console.info('[session] firebase not configured — local-only client');
      set({ phase: 'ready', uid: LOCAL_ACCOUNT.id, account: LOCAL_ACCOUNT });
      return;
    }
    void import('@/services/auth/firebaseAuth').then(({ firebaseAuth }) => {
      firebaseAuth.onChange((u) => {
        if (!u) {
          set({ phase: 'anonymous', uid: null, account: null });
          return;
        }
        set({ uid: u.uid });
        void get().refreshAccount();
      });
    });
  },

  async signIn(email, password, create, phone, role) {
    set({ error: null });
    try {
      const [{ firebaseAuth }, accounts] = await Promise.all([
        import('@/services/auth/firebaseAuth'),
        import('@/services/accounts/accountService'),
      ]);
      if (create) {
        const user = await firebaseAuth.signUp(email, password);
        if (role === 'coach') {
          await accounts.provisionSelfCoach(user.uid, email, phone);
          // Auto trial plan (Layer A). Best-effort: a failure here must not block
          // the coach from signing in — backfill/reconcile can repair it.
          try {
            const { createTrialPlan } = await import('@/services/platform/coachPlanApi');
            await createTrialPlan(user.uid);
          } catch (e) {
            console.warn('[session] coach trial plan not created (non-fatal):', e);
          }
        } else {
          await accounts.provisionSelf(user.uid, email, phone);
        }
        set({ uid: user.uid });
      } else {
        const user = await firebaseAuth.signIn(email, password);
        set({ uid: user.uid });
      }
      await get().refreshAccount();
      return true;
    } catch (e) {
      console.error('[session] sign-in failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sign-in failed' });
      return false;
    }
  },

  async signOut() {
    const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
    await firebaseAuth.signOutUser();
    set({ phase: 'anonymous', uid: null, account: null });
  },

  async refreshAccount() {
    const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
    const uid = get().uid ?? firebaseAuth.currentUid();
    if (!uid) {
      set({ phase: 'anonymous', account: null });
      return;
    }
    try {
      const accounts = await import('@/services/accounts/accountService');
      let record = await accounts.fetchUserRecord(uid);
      if (!record) {
        // Authenticated but no identity doc yet (sign-up race, or a pre-RBAC
        // account). Provision locked defaults so the user lands somewhere sane.
        record = await accounts.provisionSelf(uid, firebaseAuth.currentEmail() ?? '');
      }
      set({ uid, account: record, phase: phaseForStatus(record.accountStatus) });
    } catch (e) {
      console.error('[session] failed to load account:', e);
      set({ error: e instanceof Error ? e.message : 'Failed to load account' });
    }
  },

  async updateContact(phone) {
    await get().updateSelf({ phone: phone.trim() });
  },

  async updateSelf(patch) {
    const account = get().account;
    if (!account || account.id === LOCAL_ACCOUNT.id) return;
    const { ensureFirebase } = await import('@/data/adapters/firebase/firebase');
    const { doc, setDoc, deleteField } = await import('firebase/firestore');
    const { db } = ensureFirebase();
    // Build the Firestore patch (undefined → deleteField so clearing a photo works).
    const fields: Record<string, unknown> = { updatedAt: Date.now() };
    for (const k of ['displayName', 'phone', 'photoUrl', 'timezone'] as const) {
      if (k in patch) fields[k] = patch[k] === undefined ? deleteField() : patch[k];
    }
    await setDoc(doc(db, 'users', account.id), fields, { merge: true });
    set({ account: { ...account, ...patch } });
  },

  async resetPassword(email) {
    const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
    await firebaseAuth.resetPassword(email.trim());
  },

  async changePassword(newPassword) {
    const { firebaseAuth } = await import('@/services/auth/firebaseAuth');
    await firebaseAuth.changePassword(newPassword);
    // Clear the must-change flag (best-effort) so the prompt doesn't reappear.
    const account = get().account;
    if (account && account.id !== LOCAL_ACCOUNT.id) {
      try {
        const { ensureFirebase } = await import('@/data/adapters/firebase/firebase');
        const { doc, setDoc } = await import('firebase/firestore');
        const { db } = ensureFirebase();
        await setDoc(doc(db, 'users', account.id), { mustChangePassword: false, updatedAt: Date.now() }, { merge: true });
        set({ account: { ...account, mustChangePassword: false } });
      } catch {
        /* non-fatal */
      }
    }
  },
}));
