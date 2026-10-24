import { create } from 'zustand';
import { mongoAuth, type MongoUserRecord, type ProfilePatch } from './mongoAuth';
import { queryClient } from '@/services/platform/queryClient';
import { refreshSessionDetailed, setAccessToken, takeRefreshedUser } from '@/services/platformApi';
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

/**
 * B0 / PWA-01, PWA-08 — the session survives everything except an explicit
 * "unauthorized" answer from the server:
 *  - The last server-verified identity is kept on the device
 *    (`IDENTITY_KEY`). If the app starts or resumes while offline / on a dead
 *    connection / during a 5xx, the user stays signed in on that identity
 *    (`verified: false`) and local data stays usable; it is re-verified as
 *    soon as the network answers.
 *  - Only a 401/403 from the refresh endpoint (no cookie, expired, revoked)
 *    or an explicit sign-out ends the session.
 *  - Signing out while offline can't revoke the httpOnly refresh cookie, so
 *    a "signed out" marker (`SIGNED_OUT_KEY`) blocks every automatic restore
 *    until the server logout succeeds or someone signs in explicitly.
 */
const IDENTITY_KEY = 'forma.identity.v1';
const SIGNED_OUT_KEY = 'forma.signedOut.v1';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — the session just won't survive offline restarts */
  }
}
const rememberIdentity = (user: UserRecord) => writeKey(IDENTITY_KEY, JSON.stringify(user));
const forgetIdentity = () => writeKey(IDENTITY_KEY, null);
const cachedIdentity = () => readJson<UserRecord>(IDENTITY_KEY);
export const hasPendingSignOut = () => readJson<number>(SIGNED_OUT_KEY) != null;

/** Revokes the refresh cookie server-side after an offline sign-out; clears the marker once it lands. */
async function flushPendingSignOut(): Promise<void> {
  if (!hasPendingSignOut()) return;
  if (await mongoAuth.signOutUser()) writeKey(SIGNED_OUT_KEY, null);
}

/** True only for an explicit "not signed in" answer — never for offline / timeout / 5xx. */
function isUnauthorized(e: unknown): boolean {
  const code = (e as { data?: { code?: string } } | null)?.data?.code;
  return code === 'UNAUTHORIZED';
}

interface SessionState {
  phase: SessionPhase;
  uid: string | null;
  account: UserRecord | null;
  error: string | null;
  /**
   * False while running on the device's last verified identity because the
   * server couldn't be reached (offline start/resume). Re-verified on
   * `online` / foreground via `reverify()`.
   */
  verified: boolean;
  init: () => void;
  /**
   * Foreground / reconnect check. Re-verifies a signed-in (or offline-cached)
   * session; NEVER restores a session from a real anonymous state (explicit
   * sign-out, 401) — only from one caused by a failed offline restore.
   */
  reverify: () => Promise<void>;
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
  /** Clears the in-memory session + device identity (sign-out or a server-confirmed 401). */
  endSessionLocally: () => void;
  /** A transient failure: stay signed in (or fall back to the cached identity during boot). */
  keepOfflineSession: () => void;
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
  /** Own non-control profile fields. `photoUrl: null` removes the photo. */
  updateSelf: (patch: ProfilePatch) => Promise<void>;
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
/** Anonymous only because the boot restore couldn't reach the server (no cached identity) — retry on reconnect. */
let restorePending = false;

export const useSession = create<SessionState>((set, get) => ({
  phase: 'loading',
  uid: null,
  account: null,
  error: null,
  verified: false,

  init() {
    if (initialized) return; // React StrictMode mounts effects twice in dev
    initialized = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void flushPendingSignOut();
        void get().reverify();
      });
    }
    void (async () => {
      if (hasPendingSignOut()) {
        // Signed out on this device (possibly offline): never auto-restore.
        set({ phase: 'anonymous', uid: null, account: null, verified: false });
        void flushPendingSignOut();
        return;
      }
      const outcome = await refreshSessionDetailed();
      if (outcome === 'ok') {
        await get().refreshAccount({ silent: true });
        return;
      }
      if (outcome === 'unauthorized') {
        forgetIdentity();
        set({ phase: 'anonymous', uid: null, account: null, verified: false });
        return;
      }
      // Offline / timeout / server error: keep the last verified identity.
      get().keepOfflineSession();
    })();
  },

  async reverify() {
    if (hasPendingSignOut()) return;
    const { phase, verified } = get();
    if (phase === 'loading') return;
    if (phase === 'anonymous' && !restorePending) return; // a real sign-out / 401 is final
    if (phase !== 'anonymous' && verified) {
      await get().refreshAccount({ silent: true });
      return;
    }
    const outcome = await refreshSessionDetailed();
    if (outcome === 'ok') {
      restorePending = false;
      await get().refreshAccount({ silent: true });
    } else if (outcome === 'unauthorized') {
      restorePending = false;
      get().endSessionLocally();
    }
    // network / error: stay as we are; the next reconnect/foreground retries
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
      get().hydrate(user);
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
      get().hydrate(user);
      return true;
    } catch (e) {
      console.error('[session] Google sign-in failed:', e);
      set({ error: e instanceof Error ? e.message : 'Sign-in failed' });
      return false;
    }
  },

  hydrate(user) {
    // An explicit sign-in supersedes an earlier offline sign-out on this device.
    writeKey(SIGNED_OUT_KEY, null);
    restorePending = false;
    rememberIdentity(user);
    set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus), verified: true, error: null });
  },

  async signOut() {
    const revoked = await mongoAuth.signOutUser();
    // Offline (or the server didn't answer): the refresh cookie is still valid
    // server-side. Remember the sign-out so nothing restores this account
    // automatically; the logout is retried on the next reconnect / launch.
    if (!revoked) writeKey(SIGNED_OUT_KEY, JSON.stringify(Date.now()));
    get().endSessionLocally();
  },

  endSessionLocally() {
    setAccessToken(null);
    forgetIdentity();
    // Drop every cached server read BEFORE the next account can mount: the
    // shared QueryClient outlives the session, so without this the next user
    // on this device saw the previous user's lists/plan/requests until each
    // query happened to refetch.
    queryClient.clear();
    set({ phase: 'anonymous', uid: null, account: null, verified: false });
  },

  keepOfflineSession() {
    // Transient failure: keep whoever is signed in. During boot (no account
    // yet) fall back to the device's last verified identity.
    if (get().account) {
      set({ verified: false });
      return;
    }
    const cached = cachedIdentity();
    if (cached) set({ uid: cached.id, account: cached, phase: phaseForStatus(cached.accountStatus), verified: false });
    else {
      restorePending = true;
      set({ phase: 'anonymous', uid: null, account: null, verified: false });
    }
  },

  async refreshAccount(opts) {
    const accept = (user: UserRecord) => {
      if (hasPendingSignOut()) return; // signed out while this was in flight
      restorePending = false;
      rememberIdentity(user);
      set({ uid: user.id, account: user, phase: phaseForStatus(user.accountStatus), verified: true });
    };
    // B1.13 / PF-01: a refresh that just succeeded already returned the user —
    // use it instead of a second, serial `auth.me` round-trip.
    const fresh = takeRefreshedUser<UserRecord>();
    if (fresh?.id) {
      accept(fresh);
      return;
    }
    try {
      accept(await mongoAuth.me());
    } catch (e) {
      // Only an explicit "unauthorized" ends the session — and only once the
      // refresh endpoint itself confirms it (the 401 may just mean the access
      // token expired while the refresh call failed for a network reason).
      if (isUnauthorized(e)) {
        const outcome = await refreshSessionDetailed();
        if (outcome === 'ok') {
          try {
            accept(await mongoAuth.me());
            return;
          } catch (e2) {
            if (!isUnauthorized(e2)) return void get().keepOfflineSession();
          }
        } else if (outcome !== 'unauthorized') {
          return void get().keepOfflineSession();
        }
        console.warn('[session] session ended by the server');
        get().endSessionLocally();
        if (!opts?.silent) set({ error: e instanceof Error ? e.message : 'Failed to load account' });
        return;
      }
      console.warn('[session] account check failed (kept signed in):', e);
      get().keepOfflineSession();
      if (!opts?.silent) set({ error: e instanceof Error ? e.message : 'Failed to load account' });
    }
  },

  async updateContact(phone) {
    await get().updateSelf({ phone: phone.trim() });
  },

  async updateSelf(patch) {
    const account = get().account;
    if (!account) return;
    const updated = await mongoAuth.updateProfile(patch);
    rememberIdentity(updated);
    set({ account: updated });
  },

  async resetPassword(email) {
    await mongoAuth.requestPasswordReset(email.trim());
  },

  async changePassword(currentPassword, newPassword) {
    const account = get().account;
    if (!account) return;
    await mongoAuth.changePassword(currentPassword, newPassword);
    const next = { ...account, mustChangePassword: false };
    rememberIdentity(next);
    set({ account: next });
  },
}));

/*
 * The query cache belongs to ONE account (B1.12). Sign-out clears it, but an
 * account can also change WITHOUT a sign-out in this tab — another tab signs
 * out and in as someone else, and this tab learns it from its next refresh.
 * Any change of signed-in account drops every cached server read first.
 */
let cacheOwner: string | null = null;
useSession.subscribe((s) => {
  if (s.uid && cacheOwner && s.uid !== cacheOwner) queryClient.clear();
  if (s.uid) cacheOwner = s.uid;
});
