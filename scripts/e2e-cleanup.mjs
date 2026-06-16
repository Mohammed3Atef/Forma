// @ts-nocheck
/**
 * E2E test-data cleanup.
 *
 * The Playwright suite mints throwaway accounts + client data every run (names
 * like "QA …", emails like "qa-…@forma-e2e.test"). This prunes that data from
 * Firestore so the project doesn't accumulate cruft.
 *
 * It uses the Firebase **client** SDK (no Admin SDK / service account), so:
 *   - It signs in as the E2E super_admin to read users + delete user/clientData
 *     docs (rules allow super_admin to delete users).
 *   - It signs in as the E2E coach to delete that coach's test coachAssets
 *     (rules only let the owning coach write their assets).
 *   - It CANNOT delete Firebase **Auth** users (client SDK limitation) or
 *     adminAuditLogs (immutable by rules). Those are reported for manual pruning.
 *
 * Safety: the four E2E role accounts (super/admin/coach/client) and any
 * super_admin/admin user are NEVER deleted. Only name/email-prefixed test data.
 *
 * Run: `npm run test:e2e:cleanup`
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, deleteDoc, getDoc } from 'firebase/firestore';

// ---- .env (zero-dep parse, mirrors e2e/fixtures/env.ts) --------------------
function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const cfg = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};
if (!cfg.apiKey || !cfg.projectId) {
  console.error('[cleanup] Missing VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID in .env');
  process.exit(1);
}

const CREDS = {
  super: { email: process.env.E2E_SUPER_EMAIL, password: process.env.E2E_SUPER_PASSWORD },
  coach: { email: process.env.E2E_COACH_EMAIL, password: process.env.E2E_COACH_PASSWORD },
};
const PROTECTED_EMAILS = new Set(
  [process.env.E2E_SUPER_EMAIL, process.env.E2E_ADMIN_EMAIL, process.env.E2E_COACH_EMAIL, process.env.E2E_CLIENT_EMAIL]
    .filter(Boolean)
    .map((e) => e.toLowerCase()),
);

// clientData subtrees the app writes (client SDK can't list subcollections, so
// we enumerate the known ones).
const CLIENT_COLLECTIONS = [
  'workoutLogs', 'nutritionLogs', 'cardioLogs', 'weightLogs', 'measurementLogs',
  'dailyChecklists', 'progressPhotos', 'reminders', 'coachNotes', 'coachTargets',
  'planVersions', 'deletions', 'workoutPlans', 'nutritionPlans',
];
const CLIENT_DOCS = [['profile', 'main'], ['profile', 'assessment'], ['settings', 'app'], ['plan', 'workout'], ['plan', 'nutrition'], ['plan', 'cardio']];
const COACH_ASSET_COLLECTIONS = ['exercises', 'workoutTemplates', 'nutritionTemplates', 'foods', 'foodGroups'];

const TEST_NAME = /^qa\b|^qa[-\s]/i;
const isTestStr = (s) => typeof s === 'string' && (TEST_NAME.test(s.trim()) || s.toLowerCase().startsWith('qa') || s.toLowerCase().startsWith('qa-') || s.toLowerCase().includes('forma-e2e'));

function session(name) {
  const app = initializeApp(cfg, `cleanup-${name}-${Date.now()}`);
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
async function close(s) {
  await signOut(s.auth).catch(() => {});
  await deleteApp(s.app).catch(() => {});
}
async function delColl(db, segments) {
  let n = 0;
  const snap = await getDocs(collection(db, ...segments)).catch(() => null);
  if (!snap) return 0;
  for (const d of snap.docs) {
    await deleteDoc(d.ref).catch(() => {});
    n += 1;
  }
  return n;
}

async function cleanUsersAndClientData() {
  if (!CREDS.super.email) { console.warn('[cleanup] no E2E_SUPER_EMAIL — skipping users/clientData pass'); return; }
  const s = session('super');
  let removedUsers = 0;
  let removedDocs = 0;
  try {
    await signInWithEmailAndPassword(s.auth, CREDS.super.email, CREDS.super.password);
    const users = await getDocs(collection(s.db, 'users'));
    const targets = users.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => {
        if (PROTECTED_EMAILS.has((u.email ?? '').toLowerCase())) return false;
        if (u.role === 'super_admin' || u.role === 'admin') return false; // never touch privileged
        return isTestStr(u.displayName) || isTestStr(u.email);
      });
    console.log(`[cleanup] ${targets.length} test user(s) to prune.`);

    for (const u of targets) {
      for (const c of CLIENT_COLLECTIONS) removedDocs += await delColl(s.db, ['clientData', u.id, c]);
      for (const path of CLIENT_DOCS) {
        const ref = doc(s.db, 'clientData', u.id, ...path);
        if ((await getDoc(ref).catch(() => null))?.exists()) { await deleteDoc(ref).catch(() => {}); removedDocs += 1; }
      }
      await deleteDoc(doc(s.db, 'users', u.id)).catch(() => {});
      removedUsers += 1;
    }

    // coachClients relationships referencing any pruned user.
    const ids = new Set(targets.map((u) => u.id));
    const rels = await getDocs(collection(s.db, 'coachClients')).catch(() => null);
    let removedRels = 0;
    if (rels) {
      for (const r of rels.docs) {
        const d = r.data();
        if (ids.has(d.clientId) || ids.has(d.coachId)) { await deleteDoc(r.ref).catch(() => {}); removedRels += 1; }
      }
    }
    console.log(`[cleanup] removed ${removedUsers} users, ${removedDocs} clientData docs, ${removedRels} coachClients rels.`);
  } finally {
    await close(s);
  }
}

async function cleanCoachAssets() {
  if (!CREDS.coach.email) { console.warn('[cleanup] no E2E_COACH_EMAIL — skipping coachAssets pass'); return; }
  const s = session('coach');
  let removed = 0;
  try {
    const cred = await signInWithEmailAndPassword(s.auth, CREDS.coach.email, CREDS.coach.password);
    const coachId = cred.user.uid;
    for (const c of COACH_ASSET_COLLECTIONS) {
      const snap = await getDocs(collection(s.db, 'coachAssets', coachId, c)).catch(() => null);
      if (!snap) continue;
      for (const d of snap.docs) {
        const data = d.data();
        const name = typeof data.name === 'string' ? data.name : data.name?.en;
        if (data.test === true || isTestStr(name)) { await deleteDoc(d.ref).catch(() => {}); removed += 1; }
      }
    }
    console.log(`[cleanup] removed ${removed} test coachAssets docs.`);
  } finally {
    await close(s);
  }
}

(async () => {
  console.log(`[cleanup] project=${cfg.projectId}`);
  await cleanUsersAndClientData();
  await cleanCoachAssets();
  console.log('[cleanup] done.');
  console.log('[cleanup] NOTE: Firebase Auth users and adminAuditLogs cannot be deleted via the client SDK.');
  console.log('[cleanup]       Prune Auth users manually in the Firebase Console (Authentication → Users),');
  console.log('[cleanup]       or add an Admin SDK / service-account script to automate it.');
  process.exit(0);
})().catch((e) => {
  console.error('[cleanup] failed:', e?.message ?? e);
  process.exit(1);
});
