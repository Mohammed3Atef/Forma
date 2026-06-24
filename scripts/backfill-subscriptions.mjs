/**
 * One-time, idempotent backfill: give every existing coach⇄client relationship
 * that has NO subscription (or a status-less one) a default 14-day TRIAL so the
 * Phase-2 access gating never locks out a current client. NEVER downgrades an
 * existing subscription. Supports --dry-run (prints counts, writes nothing).
 *
 * Run (super-admin, who may update any coachClients via coaches.assign):
 *   SEED_EMAIL=admin@x.com SEED_PASSWORD=*** node scripts/backfill-subscriptions.mjs --dry-run
 *   SEED_EMAIL=admin@x.com SEED_PASSWORD=*** node scripts/backfill-subscriptions.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};

const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const DRY = process.argv.includes('--dry-run');
if (!EMAIL || !PASSWORD) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD (a super-admin account).');
  process.exit(1);
}

const DAY = 86_400_000;
const TRIAL_DAYS = 14;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {});

await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const snap = await getDocs(collection(db, 'coachClients'));

let scanned = 0, needs = 0, written = 0, skipped = 0;
for (const d of snap.docs) {
  scanned += 1;
  const rel = d.data();
  const hasSub = rel.subscription && typeof rel.subscription.status === 'string';
  if (hasSub) { skipped += 1; continue; }
  needs += 1;
  const now = Date.now();
  const subscription = { startAt: now, endAt: now + TRIAL_DAYS * DAY, status: 'trial', updatedAt: now };
  if (DRY) {
    console.log(`[dry-run] would set trial on ${d.id} (coach ${rel.coachId} / client ${rel.clientId})`);
    continue;
  }
  await updateDoc(doc(db, 'coachClients', d.id), { subscription, updatedAt: now });
  written += 1;
}

console.log(`\nScanned ${scanned} relationships · already had a subscription: ${skipped} · missing: ${needs} · ${DRY ? 'would write' : 'wrote'}: ${DRY ? needs : written}`);
process.exit(0);
