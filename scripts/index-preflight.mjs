/**
 * READ-ONLY index preflight (B4 checkpoint 1). For the owner to run against any database before
 * building indexes — nothing is created, dropped or changed.
 *
 *   MONGODB_URI=... MONGODB_DB=forma node scripts/index-preflight.mjs [--json]
 *
 * Unlike `mongo-init-indexes.mjs` this does NOT read .env: the target is always named explicitly.
 * Prints the target without credentials, then: indexes present / missing / conflicting, unique
 * indexes blocked by existing duplicates (with sample ids), the plans of the hot queries, and
 * estimated document counts.
 */
import { MongoClient } from 'mongodb';
import { formatPreflight, preflightIndexes, redactUri } from './indexes/preflight.mjs';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
if (!uri) {
  console.error('Set MONGODB_URI (and optionally MONGODB_DB) explicitly for this run.');
  process.exit(1);
}

const client = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
try {
  await client.connect();
  const report = await preflightIndexes(client.db(dbName));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ target: redactUri(uri), db: dbName, at: new Date().toISOString(), ...report }, null, 2));
  else console.log(`Target: ${redactUri(uri)} / database "${dbName}" (read-only)\n${formatPreflight(report)}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.close();
}
