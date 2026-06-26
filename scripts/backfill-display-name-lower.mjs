/**
 * One-time backfill: set `users/{uid}.displayNameLower = displayName.toLowerCase()`
 * on every existing user so the "Add Existing Client" name-prefix search finds
 * accounts created before the field existed. New accounts write it going forward.
 * Idempotent — skips docs already in sync.
 *
 * Runs as a SUPER ADMIN (users.read + users.manageRoles to update other docs).
 *
 *   Dry run:  SA_EMAIL=you@x SA_PASSWORD=… node scripts/backfill-display-name-lower.mjs --dry-run
 *   Apply:    SA_EMAIL=you@x SA_PASSWORD=… node scripts/backfill-display-name-lower.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, doc, getDocs, setDoc } from 'firebase/firestore';

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
  await signInWithEmailAndPassword(getAuth(app), EMAIL, PASSWORD);

  const snap = await getDocs(collection(db, 'users'));
  let fixed = 0;
  for (const d of snap.docs) {
    const u = d.data();
    const want = String(u.displayName ?? '').trim().toLowerCase();
    if (!want || u.displayNameLower === want) continue;
    fixed += 1;
    console.log(`${DRY ? '[dry-run] ' : ''}users/${d.id}: displayNameLower → "${want}"`);
    if (!DRY) await setDoc(doc(db, 'users', d.id), { displayNameLower: want, updatedAt: Date.now() }, { merge: true });
  }
  console.log(`\nUsers: ${snap.size} · ${DRY ? 'would update' : 'updated'}: ${fixed}`);
  process.exit(0);
}

main().catch((e) => { console.error('BACKFILL FAILED:', e?.code || '', e?.message || e); process.exit(1); });
