import { create } from 'zustand';
import { mongoAuth, type MongoUserRecord } from './mongoAuth';
import { setAccessToken } from '@/services/platformApi';
import type { AccountStatus, UserRecord } from '@/types';

/**
 * Session / identity store — the source of truth for "who is signed in and
 * what can they do". Backed by the Mongo auth API (`mongoAuth`) rather than
 * Firebase Auth + a `users/{uid}` Firestore doc — see
 * docs/MONGO_MIGRATION_PLAN.md for the migration this replaced.
 *
 * `MongoUserRecord` and `UserRecord` are the exact same shape field-for-field
 * (this was deliberate, to make this cutover a drop-in), so no mapping layer
 * is needed between the API response and the frontend's identity type.
 */

export type SessionPhase = 'loading' | 'anonymous' | 'pending' | 'suspended' | 'ready';

interface SessionState {
  phase: SessionPhase;
  uid: string | null;
  account: UserRecord | null;
  error: string | null;
  init: () => void;
  /**
   * Resolves true on success; on failure sets `error` and resolves false.
   * `create` + `role: 'coach'` self-registers a coach (active immediately, no
   * approval). `create` + `role: 'client'` always fails — client accounts are
   * only created via a coach's invite link (see AcceptInvite.tsx).
   */
  signIn: (email: string, password: string, create?: boolean, phone?: string, role?: 'client' | 'coach') => Promise<boolean>;
  /** Sign in with a Google ID token. Resolves true on success; on failure sets `error` and resolves false. */
  signInWithGoogle: (idToken: string) => Promise<boolean>;
  /**
   * Pushes an already-authenticated `MongoUserRecord` straight into the
   * session, exactly like the end of `signIn()` does — for flows that create
   * + sign in an account OUTSIDE the normal email/password path (currently:
   * `AcceptInvite.tsx` after `POST /api/invites/claim` returns a fresh client
   * account + access token). The caller must already have called
   * `setAccessToken()` with that response's token before calling this.
   */
  hydrate: (user: MongoUserRecord) => void;
  signOut: () => Promise<void>;
  /**
   * Re-fetches the signed-in user's own identity doc and recomputes `phase`.
   * `silent` (used by the bootstrap/background call sites — `init()`'s
   * session restore and `App.tsx`'s visibilitychange refetch) skips setting
   * `error` on failure: those callers run without the user having done
   * anything, so a raw backend error ("Not authenticated") must never appear
   * on the Login screen as if it were a response to a login attempt. An
   * explicit user action (e.g. AccountPending's "check again" button) keeps
   * the error surfaced.
   */
  refreshAccount: (opts?: { silent?: boolean }) => Promise<void>;
  updateContact: (phone: string) => Promise<void>;
  updateSelf: (patch: Partial<Pick<UserRecord, 'displayName' | 'phone' | 'photoUrl' | 'timezone' | 'currency'>>) => Promise<void>;
  /** Sends a password-reset email (works while signed out). */
  resetPassword: (email: string) => Promise<void>;
  /** Change the signed-in user's password + clear the must-change flag. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

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
    void (async () => {
      const restored = await mongoAuth.restoreSession();
      if (!restored) {
        set({ phase: 'anonymous', uid: null, account: null });
        return;
      }
      await get().refreshAccount({ silent: true });
    })();
  },

  // Re-read the identity doc when the app returns to the foreground, so a
  // coach's account-status change (suspend / pending / reactivate) takes
  // effect on the client's next focus — App.tsx wires this to visibilitychange.

  async signIn(email, password, create, phone, role) {
    set({ error: null });
    try {
      let user: MongoUserRecord;
      if (create) {
        if (role === 'client') {
          throw new Error('Client accounts are created from a coach invite link, not open sign-up.');
        }
        const displayName = email.includes('@') ? email.split('@')[0] : 'Coach';
        user = await mongoAuth.signUpCoach(email, password, displayName, phone);
      } else {
        user = await mongoAuth.signIn(email, password);
      }
      set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus) });
      return true;
    } catch (e) {
      console.error('[session] sign-in failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sign-in failed' });
      return false;
    }
  },

  async signInWithGoogle(idToken) {
    set({ error: null });
    try {
      const user = await mongoAuth.signInWithGoogle(idToken);
      set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus) });
      return true;
    } catch (e) {
      console.error('[session] Google sign-in failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sign-in failed' });
      return false;
    }
  },

  hydrate(user) {
    set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus) });
  },

  async signOut() {
    await mongoAuth.signOutUser();
    setAccessToken(null);
    set({ phase: 'anonymous', uid: null, account: null });
  },

  async refreshAccount(opts) {
    try {
      const user = await mongoAuth.me();
      set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus) });
    } catch (e) {
      console.error('[session] failed to load account:', e);
      // A failed `auth.me` (e.g. the refresh-retry in trpc.ts also failed)
      // means the in-memory access token is already useless server-side —
      // clear it too, matching what `signOut()` does, instead of leaving a
      // stale token sitting in memory alongside the now-anonymous phase.
      setAccessToken(null);
      set({
        phase: 'anonymous',
        uid: null,
        account: null,
        ...(opts?.silent ? {} : { error: e instanceof Error ? e.message : 'Failed to load account' }),
      });
    }
  },

  async updateContact(phone) {
    await get().updateSelf({ phone: phone.trim() });
  },

  async updateSelf(patch) {
    const account = get().account;
    if (!account) return;
    const updated = await mongoAuth.updateProfile(patch);
    set({ account: updated });
  },

  async resetPassword(email) {
    await mongoAuth.requestPasswordReset(email.trim());
  },

  async changePassword(currentPassword, newPassword) {
    const account = get().account;
    if (!account) return;
    await mongoAuth.changePassword(currentPassword, newPassword);
    set({ account: { ...account, mustChangePassword: false } });
  },
}));
