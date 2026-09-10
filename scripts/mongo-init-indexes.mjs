/**
 * One-time (and safe to re-run) Mongo index setup for the new auth backend.
 * Run this once against your Atlas cluster before using signup/login.
 *
 *   node scripts/mongo-init-indexes.mjs
 *
 * Reads MONGODB_URI / MONGODB_DB from .env automatically (via dotenv) — no
 * need to pass them inline. Safe to re-run: createIndex is idempotent (a
 * no-op if the index already exists with the same spec).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
if (!uri) {
  console.error('Set MONGODB_URI (and optionally MONGODB_DB) first.');
  process.exit(1);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  await db.collection('users').createIndex({ emailLower: 1 }, { unique: true, name: 'uniq_emailLower' });
  await db.collection('users').createIndex({ role: 1 }, { name: 'role' });
  await db.collection('users').createIndex({ displayNameLower: 1 }, { name: 'displayNameLower' });

  await db.collection('refreshTokens').createIndex({ userId: 1 }, { name: 'userId' });
  // TTL index: Mongo automatically deletes documents once expiresAt is in the
  // past, so revoked/expired sessions don't accumulate forever.
  await db.collection('refreshTokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });

  await db.collection('passwordResets').createIndex({ userId: 1 }, { name: 'userId' });
  await db.collection('passwordResets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });

  console.log(`Indexes ready on database "${dbName}".`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
