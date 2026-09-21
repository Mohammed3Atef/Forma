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

  // Rate limiting (api/_lib/rateLimit.ts) — one doc per (bucket, key, window);
  // TTL index reaps each window once it's expired so this never grows unbounded.
  await db.collection('rateLimits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });

  // Generic sync backend (api/sync/*) — every push/pull filters by these.
  await db.collection('syncRecords').createIndex({ clientId: 1, collection: 1, syncedAt: 1 }, { name: 'clientId_collection_syncedAt' });
  await db.collection('syncDeletions').createIndex({ clientId: 1, collection: 1, syncedAt: 1 }, { name: 'clientId_collection_syncedAt' });
  await db.collection('syncSingletons').createIndex({ clientId: 1, name: 1 }, { name: 'clientId_name' });

  // Messaging / notifications — polled on an interval by every active session.
  await db.collection('notifications').createIndex({ clientId: 1, forRole: 1, createdAt: -1 }, { name: 'clientId_forRole_createdAt' });
  await db.collection('messages').createIndex({ clientId: 1, createdAt: 1 }, { name: 'clientId_createdAt' });

  // Coach <-> client relationships.
  await db.collection('coachClients').createIndex({ coachId: 1, status: 1 }, { name: 'coachId_status' });
  await db.collection('coachClients').createIndex({ clientId: 1 }, { name: 'clientId' });

  // Coach-owned asset libraries — queried by coachId on every page load, AND
  // a bare logical `id` is only unique PER COACH (two coaches legitimately
  // share ids, e.g. every coach who seeds the starter library gets a row
  // with `id: "wger-12"`), so this must be a UNIQUE COMPOUND index, not just
  // an index on `coachId` alone — see the identity-model comment in
  // `api/coach-assets/_lib/types.ts`. The app also self-ensures this index at
  // runtime (`api/coach-assets/_lib/db.ts`), so running this script isn't a
  // hard prerequisite, but it documents the exact index and covers a
  // freshly-provisioned database before the app has served a single request.
  for (const coll of ['coachExercises', 'coachWorkoutTemplates', 'coachNutritionTemplates', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachBillingPlans']) {
    await db.collection(coll).createIndex({ coachId: 1, id: 1 }, { unique: true, name: 'uniq_coachId_id' });
  }

  // Per-client data, coach-owned or client-owned.
  await db.collection('measurementLogs').createIndex({ clientId: 1, date: -1 }, { name: 'clientId_date' });
  await db.collection('checkIns').createIndex({ clientId: 1, weekStart: -1 }, { name: 'clientId_weekStart' });
  await db.collection('checkIns').createIndex({ coachId: 1 }, { name: 'coachId' });
  await db.collection('coachNotes').createIndex({ clientId: 1, createdAt: -1 }, { name: 'clientId_createdAt' });
  await db.collection('planVersions').createIndex({ clientId: 1, kind: 1, versionNumber: -1 }, { name: 'clientId_kind_versionNumber' });

  // Fresh-start transfer archive (api/coach-clients/_service.ts's transferClientWithMode).
  await db.collection('archivedClientData').createIndex({ clientId: 1, archivedAt: -1 }, { name: 'clientId_archivedAt' });
  await db.collection('archivedClientData').createIndex({ previousCoachId: 1 }, { name: 'previousCoachId' });

  // Admin oversight / invites / transfers.
  await db.collection('adminAuditLogs').createIndex({ createdAt: -1 }, { name: 'createdAt' });
  await db.collection('adminAuditLogs').createIndex({ targetUserId: 1 }, { name: 'targetUserId' });
  await db.collection('signupInvites').createIndex({ coachId: 1, status: 1 }, { name: 'coachId_status' });
  await db.collection('transferRequests').createIndex({ toCoachId: 1, status: 1 }, { name: 'toCoachId_status' });
  await db.collection('transferRequests').createIndex({ clientId: 1 }, { name: 'clientId' });

  console.log(`Indexes ready on database "${dbName}".`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
