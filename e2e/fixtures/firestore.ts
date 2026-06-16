import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  setDoc,
  updateDoc,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { credsFor, firebaseEnvConfig, type RoleKey } from './env';

/**
 * Direct-to-Firestore client used by the security and data-integrity suites.
 *
 * No Admin SDK / service account is available, so we exercise the REAL security
 * rules exactly as a browser would: sign in with the Firebase JS SDK as one of
 * the E2E accounts and attempt reads/writes. A rejected operation is the
 * *expected* outcome for "forbidden access" tests; a resolved operation proves
 * "allowed access". This is the authoritative boundary the rules enforce.
 */

export interface FbSession {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  user: User;
  uid: string;
  close: () => Promise<void>;
}

let seq = 0;

export interface AnonDb {
  db: Firestore;
  close: () => Promise<void>;
}

/** An unauthenticated Firestore client (for "direct call must be denied" tests). */
export function unauthedDb(): AnonDb {
  const app = initializeApp(firebaseEnvConfig(), `fb-anon-${++seq}-${Date.now()}`);
  const db = getFirestore(app);
  return {
    db,
    async close() {
      await deleteApp(app).catch(() => undefined);
    },
  };
}

/**
 * Read-back sessions are CACHED by email and reused across tests in the worker.
 * The suite signs in ~hundreds of times for assertions; minting a fresh
 * password sign-in each time trips Firebase's `auth/quota-exceeded` limit and
 * makes late-running tests flaky. Reusing one authenticated client per account
 * is safe (the SDK reads from the server per request) and slashes sign-ins to
 * one per role/account. Cached sessions' `close()` is a no-op; the apps live
 * until the worker exits.
 */
const sessionCache = new Map<string, FbSession>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sign in, retrying transient auth rate-limit errors with a short backoff. */
async function signInWithRetry(auth: ReturnType<typeof getAuth>, email: string, password: string): Promise<User> {
  const waits = [0, 4000, 10_000, 20_000];
  let lastErr: unknown;
  for (const w of waits) {
    if (w) await sleep(w);
    try {
      return (await signInWithEmailAndPassword(auth, email, password)).user;
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: string }).code ?? '';
      if (!/quota|too-many|network|unavailable/i.test(code)) throw e; // not transient
    }
  }
  throw lastErr;
}

/** Sign in as one of the four E2E roles (cached/reused per role). */
export async function signInAs(role: RoleKey): Promise<FbSession> {
  const { email, password } = credsFor(role);
  return signInWith(email, password, `fb-${role}-${++seq}`);
}

/** Sign in with explicit credentials (e.g. a coach-created client), cached by email. */
export async function signInWith(email: string, password: string, name?: string): Promise<FbSession> {
  const key = email.toLowerCase();
  const cached = sessionCache.get(key);
  if (cached) return cached;

  const app = initializeApp(firebaseEnvConfig(), name ?? `fb-${++seq}-${Date.now()}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = await signInWithRetry(auth, email, password);
  const session: FbSession = {
    app,
    auth,
    db,
    user,
    uid: user.uid,
    // No-op: cached sessions are reused; the worker tears down at process exit.
    async close() {
      /* intentionally kept alive for reuse */
    },
  };
  sessionCache.set(key, session);
  return session;
}

/** Result of a guarded Firestore operation. */
export interface OpResult {
  ok: boolean;
  code?: string;
  message?: string;
}

/** Run a Firestore operation, classifying the result as allowed/denied. */
export async function attempt(fn: () => Promise<unknown>): Promise<OpResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, code: err.code, message: err.message };
  }
}

/** True when the error looks like a Firestore rules denial. */
export function isPermissionDenied(r: OpResult): boolean {
  return !r.ok && (r.code === 'permission-denied' || /insufficient permissions|permission/i.test(r.message ?? ''));
}

// --- Convenience readers (used by data-integrity checks) --------------------

export async function readDoc<T = Record<string, unknown>>(db: Firestore, path: string[]): Promise<T | null> {
  const ref = doc(db, path[0], ...path.slice(1));
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as T) : null;
}

export async function docExists(db: Firestore, path: string[]): Promise<boolean> {
  const ref = doc(db, path[0], ...path.slice(1));
  return (await getDoc(ref)).exists();
}

export async function findCoachClientRel(db: Firestore, coachId: string, clientId: string) {
  const id = `${coachId}__${clientId}`;
  const snap = await getDoc(doc(db, 'coachClients', id));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export async function listLogs(db: Firestore, clientId: string, sub: string): Promise<number> {
  const snap = await getDocs(collection(db, 'clientData', clientId, sub));
  return snap.size;
}

/** Find a user identity doc by email (needs a session that can list users). */
export async function findUserByEmail(
  db: Firestore,
  email: string,
): Promise<{ id: string; role: string; accountStatus: string; assignedCoachId?: string } | null> {
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  if (snap.empty) return null;
  return snap.docs[0].data() as { id: string; role: string; accountStatus: string; assignedCoachId?: string };
}

export { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc };
