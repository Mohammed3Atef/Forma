#!/usr/bin/env node
/**
 * B4.3 — fresh-start reset of a NON-PRODUCTION Forma database (docs/product-audit/B43_FRESH_START_PLAN.md).
 * All coach / client data is disposable test data; this empties it so a database starts clean while
 * the system configuration (and, by default, audit + financial records) stays.
 *
 *   node scripts/fresh-start-reset.mjs --env preview                       # DRY RUN (default): report only
 *   node scripts/fresh-start-reset.mjs --env preview --execute \
 *        --confirm-db <MONGODB_DB> --backup-taken --i-understand-this-deletes-data
 *   … add --include-audit-financial to also clear class D (never on production).
 *
 * Guards (every one must pass before anything is written):
 *  - `--env` names the environment: local | e2e | preview | staging. `production` is REFUSED in
 *    this phase, as is any run where VERCEL_ENV=production or the database is listed in
 *    FORMA_PRODUCTION_DBS (comma-separated) — a production reset needs its own approval and plan.
 *  - the target (host without credentials, database, env) is printed first; the dry run lists every
 *    collection, its class, its document count and what would happen.
 *  - `--execute` also needs `--confirm-db` equal to MONGODB_DB, `--backup-taken` (after the printed
 *    mongodump / Atlas snapshot) and `--i-understand-this-deletes-data`.
 * Classes (see the plan):
 *  A  system configuration          KEEP (never touched)
 *  B  identity & access             users except admins / super-admins, every session and reset token
 *  C  coach & client data           every document
 *  D  audit & financial records     KEPT unless --include-audit-financial
 *  E  ephemeral & retired           cleared / dropped (staging uploads, counters, retired collections)
 * Media in Bunny storage is NOT touched (infrastructure — a new private zone, per the plan).
 * After a run it verifies the counts and writes one `adminAuditLogs` entry for the reset.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';

export const CLASSES = {
  A: { label: 'system configuration', action: 'keep', collections: ['coachPlanTiers', 'coachCapacityPackages', 'featureFlags', 'banners'] },
  B: { label: 'identity & access', action: 'delete-non-admin', collections: ['refreshTokens', 'passwordResets', 'users'] },
  C: {
    label: 'coach & client data',
    action: 'delete',
    // Children first, the relationship last (dependency order).
    collections: [
      'syncRecords', 'syncDeletions', 'syncSingletons', 'measurementLogs', 'checkIns', 'planVersions',
      'clientWorkoutPlans', 'clientNutritionPlans', 'clientCardioPlans', 'coachTargets', 'coachNotes',
      'messages', 'notifications', 'signupInvites', 'transferRequests', 'archivedClientData', 'clientProfiles',
      'coachFavorites', 'coachExercises', 'coachFoods', 'coachFoodGroups', 'coachSupplements', 'coachWorkoutTemplates', 'coachBillingPlans',
      'coachClients',
    ],
  },
  D: { label: 'audit & financial records', action: 'keep-unless-flag', collections: ['clientPaymentTermLocks', 'clientPayments', 'subscriptionRequests', 'coachPlanRequests', 'coachCapacityEntitlements', 'coachPlans', 'adminAuditLogs'] },
  E: { label: 'ephemeral & retired', action: 'drop', collections: ['mediaUploadChunks', 'mediaUploads', 'rateLimits', 'usageStats', 'activeDays', 'ping', 'coachNutritionTemplates'] },
};
/** Run order: ephemeral, then data children → parents, then audit/financial, then identity. */
const ORDER = ['E', 'C', 'D', 'B'];
const ADMIN_ROLES = ['admin', 'super_admin'];
const ALLOWED_ENVS = ['local', 'e2e', 'preview', 'staging'];

const redactHost = (uri) => {
  try {
    const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://'));
    return u.host;
  } catch {
    return '(unparseable URI)';
  }
};

export function parseArgs(argv) {
  const val = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
  return {
    env: val('--env'),
    execute: argv.includes('--execute'),
    confirmDb: val('--confirm-db'),
    backupTaken: argv.includes('--backup-taken'),
    understand: argv.includes('--i-understand-this-deletes-data'),
    includeAuditFinancial: argv.includes('--include-audit-financial'),
    json: argv.includes('--json'),
  };
}

/** Every refusal reason for this run (empty = allowed). Pure: unit-testable without a database. */
export function refusals(args, env = process.env) {
  const out = [];
  const db = env.MONGODB_DB || 'forma';
  const prodDbs = (env.FORMA_PRODUCTION_DBS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.MONGODB_URI) out.push('MONGODB_URI is not set');
  if (!args.env) out.push(`--env is required (${ALLOWED_ENVS.join(' | ')})`);
  else if (args.env === 'production') out.push('production resets are not approved in this phase (B4.3) — use a new database per the plan');
  else if (!ALLOWED_ENVS.includes(args.env)) out.push(`unknown --env ${args.env}`);
  if (env.VERCEL_ENV === 'production') out.push('VERCEL_ENV=production in this shell');
  if (prodDbs.includes(db)) out.push(`database ${db} is listed in FORMA_PRODUCTION_DBS`);
  if (args.execute) {
    if (args.confirmDb !== db) out.push(`--confirm-db must equal MONGODB_DB (${db})`);
    if (!args.backupTaken) out.push('--backup-taken is required (take the mongodump / Atlas snapshot first)');
    if (!args.understand) out.push('--i-understand-this-deletes-data is required');
  }
  return out;
}

/** What a run would do, per collection, with live counts. */
export async function planReset(db, args) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const rows = [];
  for (const key of ['A', 'B', 'C', 'D', 'E']) {
    const cls = CLASSES[key];
    for (const name of cls.collections) {
      const present = existing.has(name);
      const count = present ? await db.collection(name).countDocuments() : 0;
      let action = cls.action;
      let affected = 0;
      if (action === 'keep') affected = 0;
      else if (action === 'keep-unless-flag') {
        action = args.includeAuditFinancial ? 'delete' : 'keep';
        affected = args.includeAuditFinancial ? count : 0;
      } else if (action === 'delete-non-admin') {
        if (name === 'users') {
          affected = present ? await db.collection(name).countDocuments({ role: { $nin: ADMIN_ROLES } }) : 0;
        } else affected = count;
      } else affected = count;
      rows.push({ class: key, collection: name, present, count, action, affected });
    }
  }
  const unclassified = [...existing].filter((n) => !rows.some((r) => r.collection === n) && !n.startsWith('system.')).sort();
  return { rows, unclassified };
}

export async function executeReset(db, plan, meta) {
  const done = [];
  for (const key of ORDER) {
    for (const r of plan.rows.filter((x) => x.class === key && x.present)) {
      if (r.action === 'keep') continue;
      const col = db.collection(r.collection);
      if (r.action === 'drop') {
        await col.drop().catch(() => undefined);
        done.push({ ...r, result: 'dropped' });
      } else if (r.action === 'delete-non-admin' && r.collection === 'users') {
        const res = await col.deleteMany({ role: { $nin: ADMIN_ROLES } });
        done.push({ ...r, result: `deleted ${res.deletedCount}` });
      } else {
        const res = await col.deleteMany({});
        done.push({ ...r, result: `deleted ${res.deletedCount}` });
      }
    }
  }
  // The reset itself is audited (the audit trail starts again from here when class D was cleared).
  await db.collection('adminAuditLogs').insertOne({
    action: 'system.fresh_start_reset',
    actorId: 'script:fresh-start-reset',
    createdAt: Date.now(),
    details: { env: meta.env, db: meta.db, includeAuditFinancial: meta.includeAuditFinancial, collections: done.map((d) => ({ name: d.collection, result: d.result })) },
  });
  return done;
}

/** After a run: what must be empty is empty, admins and configuration are still there. */
export async function verifyReset(db, args) {
  const problems = [];
  const count = (name, q = {}) => db.collection(name).countDocuments(q);
  for (const name of CLASSES.C.collections) if ((await count(name)) > 0) problems.push(`${name} is not empty`);
  for (const name of ['refreshTokens', 'passwordResets']) if ((await count(name)) > 0) problems.push(`${name} is not empty`);
  if ((await count('users', { role: { $nin: ADMIN_ROLES } })) > 0) problems.push('non-admin users remain');
  if (args.includeAuditFinancial) for (const name of CLASSES.D.collections.filter((n) => n !== 'adminAuditLogs')) if ((await count(name)) > 0) problems.push(`${name} is not empty`);
  const admins = await count('users', { role: { $in: ADMIN_ROLES } });
  const config = { formaConfig: await count('coachPlanTiers', { _id: 'forma' }), packages: await count('coachCapacityPackages'), flags: await count('featureFlags') };
  return { ok: problems.length === 0, problems, admins, config };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbName = process.env.MONGODB_DB || 'forma';
  const host = process.env.MONGODB_URI ? redactHost(process.env.MONGODB_URI) : '(unset)';
  const log = (...a) => !args.json && console.log(...a);
  log(`Forma fresh-start reset — ${args.execute ? 'EXECUTE' : 'DRY RUN'}`);
  log(`  target  host=${host}  db=${dbName}  env=${args.env ?? '(missing)'}`);
  const why = refusals(args);
  if (why.length) {
    console.error(`Refusing:\n  - ${why.join('\n  - ')}`);
    process.exit(2);
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const db = client.db(dbName);
    const plan = await planReset(db, args);
    if (args.json && !args.execute) {
      console.log(JSON.stringify({ host, db: dbName, env: args.env, ...plan }, null, 1));
      return;
    }
    for (const key of ['A', 'B', 'C', 'D', 'E']) {
      log(`\n  ${key} — ${CLASSES[key].label}`);
      for (const r of plan.rows.filter((x) => x.class === key)) log(`    ${r.collection.padEnd(26)} ${String(r.count).padStart(7)}  ${r.present ? r.action : 'absent'}${r.affected ? `  (${r.affected} affected)` : ''}`);
    }
    if (plan.unclassified.length) log(`\n  Unclassified collections (left untouched — classify them in the plan): ${plan.unclassified.join(', ')}`);
    log(`\n  Backup first, e.g.: mongodump --uri "<MONGODB_URI>" --db ${dbName} --out backups/${dbName}-$(date +%Y%m%d-%H%M)`);
    if (!args.execute) {
      log('\n  Dry run — nothing was changed.');
      return;
    }
    const done = await executeReset(db, plan, { env: args.env, db: dbName, includeAuditFinancial: args.includeAuditFinancial });
    const check = await verifyReset(db, args);
    if (args.json) console.log(JSON.stringify({ done, check }, null, 1));
    else {
      for (const d of done) log(`  ${d.collection.padEnd(26)} ${d.result}`);
      log(`\n  Verification: ${check.ok ? 'OK' : 'PROBLEMS'}  admins=${check.admins}  config=${JSON.stringify(check.config)}`);
      for (const p of check.problems) log(`    - ${p}`);
      log('\n  Next: node scripts/mongo-init-indexes.mjs, seed configuration / admin if missing, then the smoke checklist (B43_FRESH_START_PLAN.md §7).');
    }
    if (!check.ok) process.exitCode = 1;
  } finally {
    await client.close();
  }
}

// Run as a CLI; imported (the tests), it only exposes the pieces above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
