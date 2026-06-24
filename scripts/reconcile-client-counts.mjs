/**
 * Reconcile: recompute coachPlans/{coachId}.activeClientCount from the source of
 * truth (active coachClients relationships) and fix any drift. The counter is
 * maintained transactionally-ish on assign/unassign but can drift if a write
 * fails mid-flight; this script repairs it. Idempotent.
 *
 * Runs as a SUPER ADMIN (users.read to enumerate coaches + their relationships,
 * users.manageStatus to update the plan counter).
 *
 *   Dry run (prints drift, writes nothing):
 *     SA_EMAIL=you@x.com SA_PASSWORD=… node scripts/reconcile-client-counts.mjs --dry-run
 *   Apply:
 *     SA_EMAIL=you@x.com SA_PASSWORD=… node scripts/reconcile-client-counts.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDocs, query, where, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};

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

  const plans = await getDocs(collection(db, 'coachPlans'));
  let drifted = 0;
  for (const p of plans.docs) {
    const coachId = p.id;
    const rels = await getDocs(query(collection(db, 'coachClients'), where('coachId', '==', coachId), where('status', '==', 'active')));
    const actual = rels.size;
    const stored = p.data().activeClientCount ?? 0;
    if (actual === stored) continue;
    drifted += 1;
    console.log(`${DRY ? '[dry-run] ' : ''}coachPlans/${coachId}: stored=${stored} → actual=${actual}`);
    if (!DRY) await setDoc(doc(db, 'coachPlans', coachId), { activeClientCount: actual, updatedAt: Date.now() }, { merge: true });
  }
  console.log(`\nPlans: ${plans.size} · drifted: ${drifted}${DRY ? ' (no writes — dry run)' : ' (repaired)'}`);
  process.exit(0);
}

main().catch((e) => { console.error('RECONCILE FAILED:', e?.code || '', e?.message || e); process.exit(1); });
