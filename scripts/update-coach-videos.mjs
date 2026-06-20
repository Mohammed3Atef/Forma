/**
 * Patches videoUrl onto the coach's already-seeded exercises (and the copies
 * embedded in each workout template), matched by exercise name. Idempotent —
 * safe to re-run. Source: the "فيديو الشرح" YouTube links from the coach's sheet.
 *
 * Run:  SEED_EMAIL=moatef@gmail.com SEED_PASSWORD=123123 node scripts/update-coach-videos.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};
const EMAIL = process.env.SEED_EMAIL, PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('Set SEED_EMAIL and SEED_PASSWORD.'); process.exit(1); }

// Exercise name (as seeded) → explanation-video URL (?si tracking stripped).
const VIDEO = {
  'Lat stretch with external rotation': 'https://youtu.be/OkaZ-rz4oCM',
  'Upside-down KB hold': 'https://youtu.be/W91JnnJftu4',
  'Rope crunch': 'https://youtu.be/ToJeyhydUxU',
  'Incline DB press': 'https://youtube.com/shorts/ou6s32mJgjU',
  'Pec deck machine': 'https://youtube.com/shorts/a9vQ_hwIksU',
  'Chest press machine': 'https://youtu.be/vnd-GBtTMLI',
  'DB lateral raise': 'https://youtube.com/shorts/FIQt9pqinXc',
  'Tricep overhead extension': 'https://youtube.com/shorts/9Ark9S11uXw',
  'DB front raise': 'https://youtube.com/shorts/9ThlTL25DH8',
  'Tricep push-down': 'https://youtube.com/shorts/uOyF0ko4YBE',
  'Single-arm scapula pulls': 'https://youtu.be/p3xhgMqkPwg',
  'Scapula retractions': 'https://youtu.be/CTgiuFLPb0s',
  'Back extension': 'https://youtube.com/shorts/EKNRR9cSy9E',
  'Seated low row (close grip)': 'https://youtube.com/shorts/4VNYJzgw3QA',
  'Lat pulldown (wide grip)': 'https://youtube.com/shorts/77bPLrsMwiQ',
  'Rear delt fly machine': 'https://youtube.com/shorts/7tgx6QHB0-A',
  'Seated DB bicep curl': 'https://youtube.com/shorts/T8Y43hvPTEg',
  'DB shrugs': 'https://youtube.com/shorts/dwTcBceq-wI',
  'Machine preacher curl': 'https://youtube.com/shorts/S4dDLfp3e8w',
  'Deep lunge rockbacks': 'https://youtu.be/ig1tAGCidAM',
  'Ankle mobility': 'https://youtu.be/RZk374P3rhQ',
  'Hip CARs': 'https://youtu.be/TG3TVtblJzQ',
  'Adductor machine': 'https://youtube.com/shorts/BmMmt-c9aNM',
  'Leg press machine': 'https://youtube.com/shorts/EotSw18oR9w',
  'Lying leg curl': 'https://youtube.com/shorts/EfeVvA1vdd4',
  'Leg extension': 'https://youtube.com/shorts/iQ92TuvBqRo',
  'DB Romanian deadlift': 'https://youtube.com/shorts/CBOhr6H7BEY',
  'Seated calf machine': 'https://youtube.com/shorts/8BkvUI5i3EY',
  'Leg raises': 'https://youtube.com/shorts/1XgbnXtOUvk',
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const cred = await signInWithEmailAndPassword(getAuth(app), EMAIL, PASSWORD);
  const coachId = cred.user.uid;
  console.log(`Signed in. coachId = ${coachId}`);

  // 1) Library exercises.
  const exSnap = await getDocs(collection(db, 'coachAssets', coachId, 'exercises'));
  let exHit = 0;
  for (const d of exSnap.docs) {
    const url = VIDEO[(d.data().name || '').trim()];
    if (url) { await updateDoc(doc(db, 'coachAssets', coachId, 'exercises', d.id), { videoUrl: url }); exHit++; }
  }
  console.log(`✓ Library exercises updated: ${exHit}/${exSnap.size}`);

  // 2) Exercises embedded inside each workout template.
  const tSnap = await getDocs(collection(db, 'coachAssets', coachId, 'workoutTemplates'));
  let tplHit = 0;
  for (const d of tSnap.docs) {
    const tpl = d.data();
    let changed = 0;
    for (const ex of Object.values(tpl.exercises || {})) {
      const url = VIDEO[(ex.name || '').trim()];
      if (url) { ex.videoUrl = url; changed++; }
    }
    if (changed) {
      await setDoc(doc(db, 'coachAssets', coachId, 'workoutTemplates', d.id), { ...tpl, updatedAt: Date.now() });
      tplHit += changed;
      console.log(`  · ${tpl.name}: ${changed} exercises linked`);
    }
  }
  console.log(`✓ Template exercises updated: ${tplHit}`);
  console.log('\nDone. Exercises now show a 🎬 link that opens the video.');
  process.exit(0);
}
main().catch((e) => { console.error('UPDATE FAILED:', e?.code || '', e?.message || e); process.exit(1); });
