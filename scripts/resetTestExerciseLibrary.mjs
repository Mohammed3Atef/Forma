/**
 * Test-stage-only reset: wipes the exercise/food/template library for the
 * named E2E test coach accounts (E2E_COACH_EMAIL / E2E_COACHB_EMAIL /
 * E2E_COACHC_EMAIL from .env) so they can be cleanly reseeded from the new
 * wger-backed starter dataset (`public/data/exercise-library.json`), instead
 * of carrying over the old 91-exercise free-exercise-db rows (different ids
 * — `3_4_Sit-Up` etc. vs `wger-N` — so the old and new starter rows would
 * otherwise just sit side by side, doubling the library instead of
 * replacing it).
 *
 * SCOPE — deliberately narrow: only ever touches the specific coachIds
 * resolved from the E2E_COACH*_EMAIL accounts named above. Never touches
 * `users`, auth/session data, or any other coach's data. Prints exactly
 * what it's about to delete (collection + coachId + count) before doing so.
 *
 * Usage: node scripts/resetTestExerciseLibrary.mjs
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'forma';
if (!MONGODB_URI) throw new Error('Missing MONGODB_URI in .env');

const TEST_COACH_EMAILS = [process.env.E2E_COACH_EMAIL, process.env.E2E_COACHB_EMAIL, process.env.E2E_COACHC_EMAIL].filter(Boolean);
if (TEST_COACH_EMAILS.length === 0) throw new Error('No E2E_COACH*_EMAIL vars set in .env — nothing to scope this reset to.');

const COLLECTIONS = ['coachExercises', 'coachFoods', 'coachFoodGroups', 'coachWorkoutTemplates'];

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(MONGODB_DB);

const coaches = await db
  .collection('users')
  .find({ emailLower: { $in: TEST_COACH_EMAILS.map((e) => e.toLowerCase()) } }, { projection: { _id: 1, emailLower: 1 } })
  .toArray();

if (coaches.length === 0) {
  console.log('No matching coach accounts found for the configured E2E_COACH*_EMAIL values — nothing to do.');
  await client.close();
  process.exit(0);
}

console.log('This will delete library rows for ONLY these test coach accounts:');
for (const c of coaches) console.log(`  - ${c.emailLower} (id: ${c._id})`);
console.log('Collections affected:', COLLECTIONS.join(', '));
console.log('Nothing else (users, auth, other coaches, other collections) is touched.\n');

const coachIds = coaches.map((c) => c._id);
let totalDeleted = 0;
for (const collName of COLLECTIONS) {
  const col = db.collection(collName);
  const count = await col.countDocuments({ coachId: { $in: coachIds } });
  if (count === 0) {
    console.log(`${collName}: 0 rows to delete`);
    continue;
  }
  const res = await col.deleteMany({ coachId: { $in: coachIds } });
  console.log(`${collName}: deleted ${res.deletedCount} rows`);
  totalDeleted += res.deletedCount;
}

console.log(`\nDone. ${totalDeleted} rows deleted. Each test coach can now click "Load starter library" to reseed from the new dataset.`);
await client.close();
