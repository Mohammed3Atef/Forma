/**
 * THE list of MongoDB indexes Forma expects (B4 checkpoint 1). One declarative source for:
 *  - `scripts/mongo-init-indexes.mjs` (creates them — only with `--apply`),
 *  - `scripts/index-preflight.mjs` (read-only report: what exists, what is missing, what a unique
 *    index would collide with, how the hot queries are planned).
 *
 * `runtime: true` marks an index the API also self-ensures on first use (so a deploy builds it —
 * keep those additive or on collections that start empty). `test/indexManifest.test.ts` checks that
 * every runtime-ensured index name in `api/` is listed here.
 *
 * `uniqueGroup` (unique indexes only): how to look for existing duplicates BEFORE building — the
 * key fields to group by and the filter the index applies to. A unique index is never built over
 * duplicates; the duplicates are reported for the owner to resolve (no data is ever changed).
 */

/** @typedef {{ name: string, unique?: boolean, partialFilterExpression?: object, expireAfterSeconds?: number }} IndexOptions */
/** @typedef {{ collection: string, key: Record<string, 1 | -1>, options: IndexOptions, note: string, since?: string, runtime?: boolean, uniqueGroup?: { fields: string[], match?: object } }} IndexSpec */

/** @type {IndexSpec[]} */
export const INDEXES = [
  { collection: 'users', key: { emailLower: 1 }, options: { name: 'uniq_emailLower', unique: true }, note: 'one account per email', uniqueGroup: { fields: ['emailLower'] } },
  { collection: 'users', key: { role: 1 }, options: { name: 'role' }, note: 'admin lists by role' },
  { collection: 'users', key: { displayNameLower: 1 }, options: { name: 'displayNameLower' }, note: 'client search by name' },

  { collection: 'refreshTokens', key: { userId: 1 }, options: { name: 'userId' }, note: 'revoke all sessions of a user' },
  { collection: 'refreshTokens', key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 }, note: 'TTL: expired sessions are reaped' },
  { collection: 'passwordResets', key: { userId: 1 }, options: { name: 'userId' }, note: 'reset tokens of a user' },
  { collection: 'passwordResets', key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 }, note: 'TTL: expired reset tokens are reaped' },
  { collection: 'rateLimits', key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 }, note: 'TTL: each rate-limit window is reaped once over (B36-R4)' },

  { collection: 'syncRecords', key: { clientId: 1, collection: 1, syncedAt: 1 }, options: { name: 'clientId_collection_syncedAt' }, note: 'sync push/pull' },
  { collection: 'syncRecords', key: { clientId: 1, collection: 1, 'data.finished': 1, 'data.date': -1 }, options: { name: 'clientId_collection_finished_date' }, note: 'newest finished workout per client (coach directory, PF-14)', since: 'B3.9' },
  { collection: 'syncDeletions', key: { clientId: 1, collection: 1, syncedAt: 1 }, options: { name: 'clientId_collection_syncedAt' }, note: 'sync tombstones' },
  { collection: 'syncSingletons', key: { clientId: 1, name: 1 }, options: { name: 'clientId_name' }, note: 'sync singletons' },

  { collection: 'notifications', key: { clientId: 1, forRole: 1, createdAt: -1 }, options: { name: 'clientId_forRole_createdAt' }, note: 'notification feed' },
  { collection: 'notifications', key: { clientId: 1, forRole: 1, seenAt: 1 }, options: { name: 'clientId_forRole_seenAt' }, note: 'unread count on every feed poll (PF-14)', since: 'B3.9' },
  { collection: 'messages', key: { clientId: 1, createdAt: 1 }, options: { name: 'clientId_createdAt' }, note: 'thread reads' },
  {
    collection: 'messages',
    key: { clientId: 1, fromUserId: 1, clientMsgId: 1 },
    options: { name: 'uniq_clientMsgId', unique: true, partialFilterExpression: { clientMsgId: { $exists: true } } },
    note: 'messages.send retry idempotency',
    runtime: true,
    uniqueGroup: { fields: ['clientId', 'fromUserId', 'clientMsgId'], match: { clientMsgId: { $exists: true } } },
  },

  { collection: 'coachPlans', key: { plan: 1, endsAt: 1 }, options: { name: 'plan_endsAt' }, note: 'Forma subscription sweep' },
  { collection: 'coachPlans', key: { status: 1, endsAt: 1 }, options: { name: 'status_endsAt' }, note: 'lapsed-term sweep' },
  {
    collection: 'coachPlanRequests',
    key: { coachId: 1, requestKey: 1 },
    options: { name: 'uniq_coachId_requestKey_actionable', unique: true, partialFilterExpression: { status: { $in: ['awaiting', 'processing'] } } },
    note: 'one actionable request per (coach, requestKey)',
    runtime: true,
    uniqueGroup: { fields: ['coachId', 'requestKey'], match: { status: { $in: ['awaiting', 'processing'] } } },
  },
  { collection: 'coachPlanRequests', key: { status: 1, confirmationDeadline: 1 }, options: { name: 'status_confirmationDeadline' }, note: 'request expiry sweep', runtime: true },
  { collection: 'coachPlanRequests', key: { coachId: 1, requestedAt: -1 }, options: { name: 'coachId_requestedAt' }, note: 'a coach’s requests', runtime: true },

  { collection: 'coachCapacityPackages', key: { active: 1, coachVisible: 1, sortOrder: 1 }, options: { name: 'active_visible_order' }, note: 'add-on catalogue order', runtime: true },
  { collection: 'coachCapacityEntitlements', key: { coachId: 1, status: 1 }, options: { name: 'coachId_status' }, note: 'a coach’s entitlements', runtime: true },
  {
    collection: 'coachCapacityEntitlements',
    key: { coachId: 1, sourcePackageId: 1 },
    options: { name: 'uniq_active_coach_package', unique: true, partialFilterExpression: { status: 'active', sourcePackageId: { $type: 'string' } } },
    note: 'one active entitlement per (coach, package)',
    runtime: true,
    uniqueGroup: { fields: ['coachId', 'sourcePackageId'], match: { status: 'active', sourcePackageId: { $type: 'string' } } },
  },
  {
    collection: 'coachCapacityEntitlements',
    key: { requestId: 1 },
    options: { name: 'uniq_requestId', unique: true, partialFilterExpression: { requestId: { $type: 'string' } } },
    note: 'one entitlement per confirmed request',
    runtime: true,
    uniqueGroup: { fields: ['requestId'], match: { requestId: { $type: 'string' } } },
  },
  { collection: 'coachCapacityEntitlements', key: { status: 1, endsAt: 1 }, options: { name: 'status_endsAt' }, note: 'entitlement expiry sweep', runtime: true },

  { collection: 'mediaUploads', key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 }, note: 'TTL: abandoned chunked uploads', runtime: true },
  { collection: 'mediaUploadChunks', key: { expiresAt: 1 }, options: { name: 'ttl_expiresAt', expireAfterSeconds: 0 }, note: 'TTL: abandoned upload chunks', runtime: true },
  { collection: 'mediaUploadChunks', key: { uploadId: 1, index: 1 }, options: { name: 'uploadId_index' }, note: 'chunk assembly', runtime: true },

  { collection: 'coachClients', key: { coachId: 1, status: 1 }, options: { name: 'coachId_status' }, note: 'a coach’s roster' },
  { collection: 'coachClients', key: { clientId: 1 }, options: { name: 'clientId' }, note: 'a client’s relationships' },
  {
    collection: 'coachClients',
    key: { clientId: 1 },
    options: { name: 'uniq_active_client', unique: true, partialFilterExpression: { status: 'active' } },
    note: 'one ACTIVE coach per client, enforced by the database too (the app already guarantees it transactionally)',
    since: 'B3.9',
    uniqueGroup: { fields: ['clientId'], match: { status: 'active' } },
  },

  { collection: 'clientPayments', key: { coachId: 1, requestId: 1 }, options: { name: 'uniq_coach_request', unique: true }, note: 'payment record idempotency', since: 'B3.8', runtime: true, uniqueGroup: { fields: ['coachId', 'requestId'] } },
  {
    collection: 'clientPayments',
    key: { reversesId: 1 },
    options: { name: 'uniq_reverses', unique: true, partialFilterExpression: { reversesId: { $type: 'string' } } },
    note: 'a payment is reversed at most once',
    since: 'B3.8',
    runtime: true,
    uniqueGroup: { fields: ['reversesId'], match: { reversesId: { $type: 'string' } } },
  },
  { collection: 'clientPayments', key: { coachId: 1, paidAt: -1 }, options: { name: 'coachId_paidAt' }, note: 'a coach’s ledger', since: 'B3.8', runtime: true },
  { collection: 'clientPayments', key: { relationshipId: 1, termId: 1 }, options: { name: 'relationshipId_termId' }, note: 'payments of a term', since: 'B3.8', runtime: true },

  ...['coachExercises', 'coachWorkoutTemplates', 'coachNutritionTemplates', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachBillingPlans'].map((collection) => ({
    collection,
    key: { coachId: 1, id: 1 },
    options: { name: 'uniq_coachId_id', unique: true },
    note: 'coach-owned library row (a logical id is unique per coach only)',
    runtime: true,
    uniqueGroup: { fields: ['coachId', 'id'] },
  })),

  { collection: 'measurementLogs', key: { clientId: 1, date: -1 }, options: { name: 'clientId_date' }, note: 'measurements' },
  { collection: 'checkIns', key: { clientId: 1, weekStart: -1 }, options: { name: 'clientId_weekStart' }, note: 'a client’s check-ins' },
  { collection: 'checkIns', key: { coachId: 1 }, options: { name: 'coachId' }, note: 'a coach’s check-in queue' },
  { collection: 'coachNotes', key: { clientId: 1, createdAt: -1 }, options: { name: 'clientId_createdAt' }, note: 'notes' },
  { collection: 'planVersions', key: { clientId: 1, kind: 1, versionNumber: -1 }, options: { name: 'clientId_kind_versionNumber' }, note: 'plan history' },
  { collection: 'archivedClientData', key: { clientId: 1, archivedAt: -1 }, options: { name: 'clientId_archivedAt' }, note: 'fresh-start archive' },
  { collection: 'archivedClientData', key: { previousCoachId: 1 }, options: { name: 'previousCoachId' }, note: 'archive by previous coach' },
  { collection: 'adminAuditLogs', key: { createdAt: -1 }, options: { name: 'createdAt' }, note: 'audit log' },
  { collection: 'adminAuditLogs', key: { targetUserId: 1 }, options: { name: 'targetUserId' }, note: 'audit by user' },
  { collection: 'signupInvites', key: { coachId: 1, status: 1 }, options: { name: 'coachId_status' }, note: 'a coach’s invites' },
  { collection: 'transferRequests', key: { toCoachId: 1, status: 1 }, options: { name: 'toCoachId_status' }, note: 'incoming transfers' },
  { collection: 'transferRequests', key: { clientId: 1 }, options: { name: 'clientId' }, note: 'a client’s transfers' },
];

/** Superseded indexes the init script removes (index only — never data), with `--apply` only. */
export const LEGACY_DROPS = [{ collection: 'coachPlanRequests', name: 'uniq_coachId_actionable', note: 'replaced by uniq_coachId_requestKey_actionable' }];

/**
 * Hot queries whose plan the preflight explains (read-only `explain('queryPlanner')`): the winning
 * plan should use `expect`. Filters use placeholder values — only the plan shape matters.
 */
export const PROBES = [
  { name: 'coach directory: newest finished workout', collection: 'syncRecords', filter: { clientId: 'probe', collection: 'workoutLogs', 'data.finished': true }, sort: { 'data.date': -1 }, expect: 'clientId_collection_finished_date' },
  { name: 'notification unread count', collection: 'notifications', filter: { clientId: 'probe', forRole: 'coach', seenAt: null }, expect: 'clientId_forRole_seenAt' },
  { name: 'thread page', collection: 'messages', filter: { clientId: 'probe' }, sort: { createdAt: 1 }, expect: 'clientId_createdAt' },
  { name: 'active relationship of a client', collection: 'coachClients', filter: { clientId: 'probe', status: 'active' }, expect: ['clientId', 'uniq_active_client'] },
  { name: 'coach library (exercises)', collection: 'coachExercises', filter: { coachId: 'probe' }, expect: 'uniq_coachId_id' },
  { name: 'coach library (foods)', collection: 'coachFoods', filter: { coachId: 'probe' }, expect: 'uniq_coachId_id' },
];
