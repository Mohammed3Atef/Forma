/**
 * Backfill: ensure every existing coach has a Layer-A trial plan doc at
 * coachPlans/{coachId}. Idempotent and NON-DESTRUCTIVE — it never downgrades or
 * overwrites an existing plan (skips any coach that already has one).
 *
 * Runs as a SUPER ADMIN (no Admin SDK available): the super-admin session can
 * list users (users.read) and create coachPlans (users.manageStatus), exactly
 * as the security rules permit.
 *
 *   Dry run (prints counts, writes nothing):
 *     SA_EMAIL=you@x.com SA_PASSWORD=… node scripts/backfill-coach-plans.mjs --dry-run
 *   Apply:
 *     SA_EMAIL=you@x.com SA_PASSWORD=… node scripts/backfill-coach-plans.mjs
 *
 * Always dry-run against a staging copy before production.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};

const TRIAL_MAX_CLIENTS = 10;
const TRIAL_DURATION_DAYS = 15;
const DAY_MS = 86_400_000;

const DRY = process.argv.includes('--dry-run');
const EMAIL = process.env.SA_EMAIL;
const PASSWORD = process.env.SA_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set SA_EMAIL and SA_PASSWORD (a super_admin) env vars.');
  process.exit(1);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);

  const coaches = await getDocs(query(collection(db, 'users'), where('role', '==', 'coach')));
  let created = 0, skipped = 0;
  for (const c of coaches.docs) {
    const coachId = c.id;
    const existing = await getDoc(doc(db, 'coachPlans', coachId));
    if (existing.exists()) { skipped += 1; continue; }
    const now = Date.now();
    const plan = {
      coachId, plan: 'trial', status: 'active',
      maxClients: TRIAL_MAX_CLIENTS,
      startedAt: now, endsAt: now + TRIAL_DURATION_DAYS * DAY_MS,
      trialNotified: {}, activeClientCount: 0,
      createdAt: now, updatedAt: now,
    };
    if (DRY) { console.log(`[dry-run] would create coachPlans/${coachId}`); created += 1; continue; }
    await setDoc(doc(db, 'coachPlans', coachId), plan);
    created += 1;
  }
  console.log(`\nCoaches: ${coaches.size} · ${DRY ? 'would create' : 'created'}: ${created} · skipped (already had plan): ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error('BACKFILL FAILED:', e?.code || '', e?.message || e); process.exit(1); });
