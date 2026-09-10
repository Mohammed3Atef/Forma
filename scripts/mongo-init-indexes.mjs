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

  // Coach-owned asset libraries — every one queried by coachId on page load.
  for (const coll of ['coachExercises', 'coachWorkoutTemplates', 'coachNutritionTemplates', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachBillingPlans']) {
    await db.collection(coll).createIndex({ coachId: 1 }, { name: 'coachId' });
  }

  // Per-client data, coach-owned or client-owned.
  await db.collection('measurementLogs').createIndex({ clientId: 1, date: -1 }, { name: 'clientId_date' });
  await db.collection('checkIns').createIndex({ clientId: 1, weekStart: -1 }, { name: 'clientId_weekStart' });
  await db.collection('checkIns').createIndex({ coachId: 1 }, { name: 'coachId' });
  await db.collection('coachNotes').createIndex({ clientId: 1, createdAt: -1 }, { name: 'clientId_createdAt' });
  await db.collection('planVersions').createIndex({ clientId: 1, kind: 1, versionNumber: -1 }, { name: 'clientId_kind_versionNumber' });
  for (const coll of ['workoutLogs', 'nutritionLogs', 'cardioLogs', 'weightLogs']) {
    await db.collection(coll).createIndex({ clientId: 1, date: -1 }, { name: 'clientId_date' });
  }

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
