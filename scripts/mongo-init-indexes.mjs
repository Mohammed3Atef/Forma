/**
 * Mongo index setup — DRY-RUN BY DEFAULT (B4 checkpoint 1).
 *
 *   node scripts/mongo-init-indexes.mjs            # report only: what exists, what is missing,
 *                                                  # what a unique index would collide with
 *   node scripts/mongo-init-indexes.mjs --apply    # create the missing, buildable indexes
 *
 * The index list is `scripts/indexes/manifest.mjs` (also read by `scripts/index-preflight.mjs`).
 * Reads MONGODB_URI / MONGODB_DB from .env (dotenv) — CHECK THE PRINTED TARGET before `--apply`.
 * Safe to re-run: existing indexes are left alone; a unique index is never built over duplicates
 * (they are listed for the owner to resolve — this script never changes or deletes a document);
 * a conflicting definition is reported, never replaced. The only removals are the superseded
 * indexes in `LEGACY_DROPS` (index only), and only with `--apply`.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { applyIndexes, formatPreflight, preflightIndexes, redactUri } from './indexes/preflight.mjs';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
const apply = process.argv.includes('--apply');
if (!uri) {
  console.error('Set MONGODB_URI (and optionally MONGODB_DB) first.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`Target: ${redactUri(uri)} / database "${dbName}" — ${apply ? 'APPLY' : 'dry run (add --apply to create)'}`);
  try {
    if (!apply) {
      console.log(formatPreflight(await preflightIndexes(db)));
      return;
    }
    const { created, skipped } = await applyIndexes(db);
    console.log(`Created or confirmed ${created.length} index(es); skipped ${skipped.length}.`);
    for (const s of skipped) console.log(`  skipped ${s.collection}.${s.name}: ${s.reason}`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
