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
  // `messages.send` retry idempotency — a client-generated key must never
  // yield two rows even under concurrent retries (also self-ensured at
  // runtime in api/messages/_data.ts). Partial: legacy rows have no key.
  await db.collection('messages').createIndex(
    { clientId: 1, fromUserId: 1, clientMsgId: 1 },
    { unique: true, partialFilterExpression: { clientMsgId: { $exists: true } }, name: 'uniq_clientMsgId' },
  );

  // Forma subscription (coachPlans) — the daily cron sweeps lapsed terms by
  // status + endsAt. One actionable request per (coach, requestKey) — so a
  // coach can have an open subscription request AND open add-on requests at
  // once; replaces the old per-coach 'uniq_coachId_actionable', dropped
  // here (also self-ensured in api/coach-plans/_data.ts).
  await db.collection('coachPlans').createIndex({ plan: 1, endsAt: 1 }, { name: 'plan_endsAt' });
  await db.collection('coachPlans').createIndex({ status: 1, endsAt: 1 }, { name: 'status_endsAt' });
  await db.collection('coachPlanRequests').dropIndex('uniq_coachId_actionable').catch(() => undefined);
  await db.collection('coachPlanRequests').createIndex(
    { coachId: 1, requestKey: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ['awaiting', 'processing'] } }, name: 'uniq_coachId_requestKey_actionable' },
  );
  await db.collection('coachPlanRequests').createIndex({ status: 1, confirmationDeadline: 1 }, { name: 'status_confirmationDeadline' });
  await db.collection('coachPlanRequests').createIndex({ coachId: 1, requestedAt: -1 }, { name: 'coachId_requestedAt' });

  // Client-capacity add-ons (api/coach-plans/_capacity.ts, also self-ensured
  // there): catalogue ordering; one ACTIVE entitlement per (coach, package);
  // one entitlement per confirmed request; expiry sweep.
  await db.collection('coachCapacityPackages').createIndex({ active: 1, coachVisible: 1, sortOrder: 1 }, { name: 'active_visible_order' });
  await db.collection('coachCapacityEntitlements').createIndex({ coachId: 1, status: 1 }, { name: 'coachId_status' });
  await db.collection('coachCapacityEntitlements').createIndex(
    { coachId: 1, sourcePackageId: 1 },
    { unique: true, partialFilterExpression: { status: 'active', sourcePackageId: { $type: 'string' } }, name: 'uniq_active_coach_package' },
  );
  await db.collection('coachCapacityEntitlements').createIndex({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: 'string' } }, name: 'uniq_requestId' });
  await db.collection('coachCapacityEntitlements').createIndex({ status: 1, endsAt: 1 }, { name: 'status_endsAt' });

  // Chunked media uploads (api/media/[action].ts) — staging rows for files
  // over one request's worth; TTL-reaped after an hour so an abandoned
  // upload never accumulates (also self-ensured in api/media/_lib/staging.ts).
  await db.collection('mediaUploads').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });
  await db.collection('mediaUploadChunks').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expiresAt' });
  await db.collection('mediaUploadChunks').createIndex({ uploadId: 1, index: 1 }, { name: 'uploadId_index' });

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
