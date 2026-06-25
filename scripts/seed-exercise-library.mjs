/**
 * Seed the open-licensed starter EXERCISE library (public/data/exercise-library.json,
 * the public-domain free-exercise-db — the single canonical dataset) into a
 * coach's own coachAssets/{coachId}/exercises. Idempotent — stable ids upsert.
 *
 *   SEED_EMAIL=coach@x.com SEED_PASSWORD=*** node scripts/seed-exercise-library.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};
const EMAIL = process.env.SEED_EMAIL, PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('Set SEED_EMAIL and SEED_PASSWORD (a coach account).'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(join(here, '..', 'public', 'data', 'exercise-library.json'), 'utf-8'));

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {});
const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
const coachId = cred.user.uid;

let n = 0;
for (const ex of items) {
  await setDoc(doc(db, 'coachAssets', coachId, 'exercises', ex.id), ex);
  n += 1;
}
console.log(`Seeded ${n} exercises into coachAssets/${coachId}/exercises`);
process.exit(0);
