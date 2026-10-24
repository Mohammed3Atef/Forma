/**
 * B4 migration step A — READ-ONLY inventory of the exercise / food library data in a database,
 * for the owner to run against production before any migration decision.
 *
 *   MONGODB_URI=... MONGODB_DB=forma node scripts/catalog/inventory.mjs [--json]
 *
 * Only reads (countDocuments, aggregate with $match/$group/$project — no $out/$merge, find with
 * projections). Prints the target without credentials. Does not read .env.
 *
 * Classifies coach library rows (seeded wger copies `wger-<n>`, the pre-wger GitHub-image rows,
 * Forma-catalog copies `cat-<id>`, the coach's own), seeded vs own foods, and how plans, templates
 * and plan versions reference exercises (embedded copies; libraryExerciseId links; catalogId
 * links; wger provenance) — the facts a mapping/archive decision needs. Per-coach counts are
 * aggregated; no names, emails or plan contents are printed.
 */
import { MongoClient } from 'mongodb';
import { redactUri } from '../indexes/preflight.mjs';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
if (!uri) {
  console.error('Set MONGODB_URI (and optionally MONGODB_DB) explicitly for this run.');
  process.exit(1);
}

const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
try {
  await client.connect();
  const db = client.db(dbName);
  const has = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const col = (n) => (has.has(n) ? db.collection(n) : null);

  const exClass = {
    $switch: {
      branches: [
        { case: { $regexMatch: { input: '$id', regex: /^wger-/ } }, then: 'seeded-wger' },
        { case: { $regexMatch: { input: '$id', regex: /^cat-/ } }, then: 'catalog-copy' },
        { case: { $regexMatch: { input: { $ifNull: ['$imageUrl', ''] }, regex: /raw\.githubusercontent\.com/ } }, then: 'legacy-github' },
      ],
      default: 'coach-own',
    },
  };
  const group = async (c, stage) => (c ? (await c.aggregate([stage, { $group: { _id: '$k', n: { $sum: 1 }, coaches: { $addToSet: '$coachId' } } }, { $project: { n: 1, coaches: { $size: '$coaches' } } }]).toArray()).reduce((m, r) => ({ ...m, [r._id]: { rows: r.n, coaches: r.coaches } }), {}) : null);

  const exercises = await group(col('coachExercises'), { $project: { coachId: 1, k: exClass } });
  const foods = await group(col('coachFoods'), { $project: { coachId: 1, k: { $cond: [{ $regexMatch: { input: '$id', regex: /^seed-food-/ } }, 'seeded', { $cond: [{ $ifNull: ['$catalogId', false] }, 'catalog-copy', 'coach-own'] }] } } });

  // Embedded exercise copies inside templates and client plans (objects keyed by plan-local id).
  const embedded = async (name) => {
    const c = col(name);
    if (!c) return null;
    const [r] = await c
      .aggregate([
        { $project: { ex: { $objectToArray: { $ifNull: ['$exercises', {}] } } } },
        { $unwind: '$ex' },
        {
          $group: {
            _id: null,
            copies: { $sum: 1 },
            libraryLinked: { $sum: { $cond: [{ $ifNull: ['$ex.v.libraryExerciseId', false] }, 1, 0] } },
            catalogLinked: { $sum: { $cond: [{ $ifNull: ['$ex.v.catalogId', false] }, 1, 0] } },
            wgerProvenance: { $sum: { $cond: [{ $eq: ['$ex.v.sourceProvider', 'wger'] }, 1, 0] } },
            githubImages: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$ex.v.imageUrl', ''] }, regex: /raw\.githubusercontent\.com/ } }, 1, 0] } },
            docs: { $addToSet: '$_id' },
          },
        },
        { $project: { _id: 0, copies: 1, libraryLinked: 1, catalogLinked: 1, wgerProvenance: 1, githubImages: 1, documents: { $size: '$docs' } } },
      ])
      .toArray();
    return r ?? { copies: 0, documents: 0 };
  };
  const plansWithFoods = async () => {
    const c = col('clientNutritionPlans');
    if (!c) return null;
    const [r] = await c
      .aggregate([{ $unwind: '$meals' }, { $unwind: '$meals.items' }, { $group: { _id: null, items: { $sum: 1 }, catalogLinked: { $sum: { $cond: [{ $ifNull: ['$meals.items.catalogId', false] }, 1, 0] } }, plans: { $addToSet: '$_id' } } }, { $project: { _id: 0, items: 1, catalogLinked: 1, plans: { $size: '$plans' } } }])
      .toArray();
    return r ?? { items: 0, plans: 0 };
  };
  const count = async (n, q = {}) => (col(n) ? col(n).countDocuments(q) : null);

  const report = {
    target: redactUri(uri),
    db: dbName,
    at: new Date().toISOString(),
    coachLibrary: { exercises, foods, foodGroups: await count('coachFoodGroups'), workoutTemplates: await count('coachWorkoutTemplates'), nutritionTemplates: await count('coachNutritionTemplates') },
    embeddedExerciseCopies: { templates: await embedded('coachWorkoutTemplates'), clientPlans: await embedded('clientWorkoutPlans') },
    nutritionPlans: await plansWithFoods(),
    planVersions: { workout: await count('planVersions', { kind: 'workout' }), nutrition: await count('planVersions', { kind: 'nutrition' }) },
    workoutLogs: await count('syncRecords', { collection: 'workoutLogs' }),
    note: 'Plans and versions store full copies (no live reference into the library), so archiving or replacing library rows never changes an existing plan. Logs key by plan-local exercise ids.',
  };
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Target: ${report.target} / database "${dbName}" (read-only)`);
    console.log(JSON.stringify(report, null, 2));
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.close();
}
