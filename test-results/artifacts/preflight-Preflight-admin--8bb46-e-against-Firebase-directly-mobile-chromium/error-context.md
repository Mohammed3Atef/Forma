# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: preflight.spec.ts >> Preflight >> admin: can authenticate against Firebase directly
- Location: e2e\preflight.spec.ts:41:5

# Error details

```
FirebaseError: Firebase: Error (auth/network-request-failed).
```

# Test source

```ts
  1   | import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
  2   | import {
  3   |   getAuth,
  4   |   signInWithEmailAndPassword,
  5   |   type Auth,
  6   |   type User,
  7   | } from 'firebase/auth';
  8   | import {
  9   |   doc,
  10  |   getDoc,
  11  |   getDocs,
  12  |   collection,
  13  |   query,
  14  |   where,
  15  |   setDoc,
  16  |   updateDoc,
  17  |   getFirestore,
  18  |   type Firestore,
  19  | } from 'firebase/firestore';
  20  | import { credsFor, firebaseEnvConfig, type RoleKey } from './env';
  21  | 
  22  | /**
  23  |  * Direct-to-Firestore client used by the security and data-integrity suites.
  24  |  *
  25  |  * No Admin SDK / service account is available, so we exercise the REAL security
  26  |  * rules exactly as a browser would: sign in with the Firebase JS SDK as one of
  27  |  * the E2E accounts and attempt reads/writes. A rejected operation is the
  28  |  * *expected* outcome for "forbidden access" tests; a resolved operation proves
  29  |  * "allowed access". This is the authoritative boundary the rules enforce.
  30  |  */
  31  | 
  32  | export interface FbSession {
  33  |   app: FirebaseApp;
  34  |   auth: Auth;
  35  |   db: Firestore;
  36  |   user: User;
  37  |   uid: string;
  38  |   close: () => Promise<void>;
  39  | }
  40  | 
  41  | let seq = 0;
  42  | 
  43  | export interface AnonDb {
  44  |   db: Firestore;
  45  |   close: () => Promise<void>;
  46  | }
  47  | 
  48  | /** An unauthenticated Firestore client (for "direct call must be denied" tests). */
  49  | export function unauthedDb(): AnonDb {
  50  |   const app = initializeApp(firebaseEnvConfig(), `fb-anon-${++seq}-${Date.now()}`);
  51  |   const db = getFirestore(app);
  52  |   return {
  53  |     db,
  54  |     async close() {
  55  |       await deleteApp(app).catch(() => undefined);
  56  |     },
  57  |   };
  58  | }
  59  | 
  60  | /**
  61  |  * Read-back sessions are CACHED by email and reused across tests in the worker.
  62  |  * The suite signs in ~hundreds of times for assertions; minting a fresh
  63  |  * password sign-in each time trips Firebase's `auth/quota-exceeded` limit and
  64  |  * makes late-running tests flaky. Reusing one authenticated client per account
  65  |  * is safe (the SDK reads from the server per request) and slashes sign-ins to
  66  |  * one per role/account. Cached sessions' `close()` is a no-op; the apps live
  67  |  * until the worker exits.
  68  |  */
  69  | const sessionCache = new Map<string, FbSession>();
  70  | 
  71  | const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  72  | 
  73  | /** Sign in, retrying transient auth rate-limit errors with a short backoff. */
  74  | async function signInWithRetry(auth: ReturnType<typeof getAuth>, email: string, password: string): Promise<User> {
  75  |   const waits = [0, 4000, 10_000, 20_000];
  76  |   let lastErr: unknown;
  77  |   for (const w of waits) {
  78  |     if (w) await sleep(w);
  79  |     try {
> 80  |       return (await signInWithEmailAndPassword(auth, email, password)).user;
      |               ^ FirebaseError: Firebase: Error (auth/network-request-failed).
  81  |     } catch (e) {
  82  |       lastErr = e;
  83  |       const code = (e as { code?: string }).code ?? '';
  84  |       if (!/quota|too-many|network|unavailable/i.test(code)) throw e; // not transient
  85  |     }
  86  |   }
  87  |   throw lastErr;
  88  | }
  89  | 
  90  | /** Sign in as one of the four E2E roles (cached/reused per role). */
  91  | export async function signInAs(role: RoleKey): Promise<FbSession> {
  92  |   const { email, password } = credsFor(role);
  93  |   return signInWith(email, password, `fb-${role}-${++seq}`);
  94  | }
  95  | 
  96  | /** Sign in with explicit credentials (e.g. a coach-created client), cached by email. */
  97  | export async function signInWith(email: string, password: string, name?: string): Promise<FbSession> {
  98  |   const key = email.toLowerCase();
  99  |   const cached = sessionCache.get(key);
  100 |   if (cached) return cached;
  101 | 
  102 |   const app = initializeApp(firebaseEnvConfig(), name ?? `fb-${++seq}-${Date.now()}`);
  103 |   const auth = getAuth(app);
  104 |   const db = getFirestore(app);
  105 |   const user = await signInWithRetry(auth, email, password);
  106 |   const session: FbSession = {
  107 |     app,
  108 |     auth,
  109 |     db,
  110 |     user,
  111 |     uid: user.uid,
  112 |     // No-op: cached sessions are reused; the worker tears down at process exit.
  113 |     async close() {
  114 |       /* intentionally kept alive for reuse */
  115 |     },
  116 |   };
  117 |   sessionCache.set(key, session);
  118 |   return session;
  119 | }
  120 | 
  121 | /** Result of a guarded Firestore operation. */
  122 | export interface OpResult {
  123 |   ok: boolean;
  124 |   code?: string;
  125 |   message?: string;
  126 | }
  127 | 
  128 | /** Run a Firestore operation, classifying the result as allowed/denied. */
  129 | export async function attempt(fn: () => Promise<unknown>): Promise<OpResult> {
  130 |   try {
  131 |     await fn();
  132 |     return { ok: true };
  133 |   } catch (e) {
  134 |     const err = e as { code?: string; message?: string };
  135 |     return { ok: false, code: err.code, message: err.message };
  136 |   }
  137 | }
  138 | 
  139 | /** True when the error looks like a Firestore rules denial. */
  140 | export function isPermissionDenied(r: OpResult): boolean {
  141 |   return !r.ok && (r.code === 'permission-denied' || /insufficient permissions|permission/i.test(r.message ?? ''));
  142 | }
  143 | 
  144 | // --- Convenience readers (used by data-integrity checks) --------------------
  145 | 
  146 | export async function readDoc<T = Record<string, unknown>>(db: Firestore, path: string[]): Promise<T | null> {
  147 |   const ref = doc(db, path[0], ...path.slice(1));
  148 |   const snap = await getDoc(ref);
  149 |   return snap.exists() ? (snap.data() as T) : null;
  150 | }
  151 | 
  152 | export async function docExists(db: Firestore, path: string[]): Promise<boolean> {
  153 |   const ref = doc(db, path[0], ...path.slice(1));
  154 |   return (await getDoc(ref)).exists();
  155 | }
  156 | 
  157 | export async function findCoachClientRel(db: Firestore, coachId: string, clientId: string) {
  158 |   const id = `${coachId}__${clientId}`;
  159 |   const snap = await getDoc(doc(db, 'coachClients', id));
  160 |   return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  161 | }
  162 | 
  163 | export async function listLogs(db: Firestore, clientId: string, sub: string): Promise<number> {
  164 |   const snap = await getDocs(collection(db, 'clientData', clientId, sub));
  165 |   return snap.size;
  166 | }
  167 | 
  168 | /** Find a user identity doc by email (needs a session that can list users). */
  169 | export async function findUserByEmail(
  170 |   db: Firestore,
  171 |   email: string,
  172 | ): Promise<{ id: string; role: string; accountStatus: string; assignedCoachId?: string } | null> {
  173 |   const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
  174 |   if (snap.empty) return null;
  175 |   return snap.docs[0].data() as { id: string; role: string; accountStatus: string; assignedCoachId?: string };
  176 | }
  177 | 
  178 | export { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc };
  179 | 
```