/**
 * READ-ONLY pre-launch report on coach plan data. Never writes anything —
 * there is no flag that makes it write. Run it against test/shared data
 * before production to see exactly which one-time fixes are still needed.
 *
 *   node scripts/report-plan-data.mjs
 *
 * Reports:
 *   1. coaches with no coachPlans doc                → scripts/backfillCoachTrialPlans.mjs
 *   2. plans with a missing/non-numeric activeClientCount, and counters that
 *      disagree with the real number of active relationships
 *                                                    → scripts/reconcile-active-client-counts.mjs
 *   3. Trial plans still carrying a cap other than the configured Trial tier's
 *      (e.g. the obsolete 10-client limit)          → re-save the Trial tier in Admin → Plans
 *                                                    (propagates to every non-overridden coach)
 *   4. tier-derived plans (no maxClientsOverride) whose cap differs from
 *      their tier's current maxClients, and plans on a tier that no longer
 *      exists                                        → same re-save, or coachPlans.adminUpdate per coach
 *
 * Reads MONGODB_URI / MONGODB_DB from .env.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
if (!uri) {
  console.error('Set MONGODB_URI (and MONGODB_DB) first.');
  process.exit(1);
}

/** Mirrors the code-seeded built-in tier in api/coach-plans/_handlers/tiers-data.ts (Mongo overrides win). */
const SEED_TIERS = { trial: { maxClients: 2 } };

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`READ-ONLY report — database "${dbName}"`);

  const coaches = await db.collection('users').find({ role: 'coach' }, { projection: { email: 1, accountStatus: 1 } }).toArray();
  const plans = await db.collection('coachPlans').find({}).toArray();
  const tierDocs = await db.collection('coachPlanTiers').find({}).toArray();
  const tiers = new Map(Object.entries(SEED_TIERS).map(([k, v]) => [k, { _id: k, ...v }]));
  for (const t of tierDocs) tiers.set(t._id, t);
  const realCounts = new Map(
    (await db.collection('coachClients').aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$coachId', n: { $sum: 1 } } }]).toArray()).map((r) => [r._id, r.n]),
  );
  const planById = new Map(plans.map((p) => [p._id, p]));
  const emailOf = (id) => coaches.find((c) => c._id === id)?.email ?? '(no coach user)';

  const actions = [];

  section('1. Coaches with no coachPlans doc');
  const noPlan = coaches.filter((c) => !planById.has(c._id));
  for (const c of noPlan) console.log(`  - ${c._id}  ${c.email}  (${c.accountStatus}; active clients: ${realCounts.get(c._id) ?? 0})`);
  console.log(`  ${noPlan.length} of ${coaches.length} coach(es)`);
  if (noPlan.length) actions.push(`node scripts/backfillCoachTrialPlans.mjs --apply   # creates a Trial plan for ${noPlan.length} coach(es)`);

  section('2. activeClientCount problems');
  const missing = plans.filter((p) => typeof p.activeClientCount !== 'number' || !Number.isFinite(p.activeClientCount));
  const drift = plans.filter((p) => typeof p.activeClientCount === 'number' && p.activeClientCount !== (realCounts.get(p._id) ?? 0));
  for (const p of missing) console.log(`  - MISSING  ${p._id}  ${emailOf(p._id)}  real active: ${realCounts.get(p._id) ?? 0}`);
  for (const p of drift) console.log(`  - DRIFT    ${p._id}  ${emailOf(p._id)}  stored: ${p.activeClientCount}  real: ${realCounts.get(p._id) ?? 0}`);
  console.log(`  ${missing.length} missing, ${drift.length} drifted (of ${plans.length} plan docs)`);
  if (missing.length || drift.length) actions.push(`node scripts/reconcile-active-client-counts.mjs --write --db=${dbName}   # after a dry run`);

  section('3. Trial plans not on the configured Trial cap');
  const trialTier = tiers.get('trial');
  const trialCap = trialTier?.maxClients;
  console.log(`  configured Trial tier maxClients: ${trialCap}`);
  const staleTrial = plans.filter((p) => p.plan === 'trial' && p.maxClientsOverride !== true && p.maxClients !== trialCap);
  for (const p of staleTrial) console.log(`  - ${p._id}  ${emailOf(p._id)}  maxClients: ${p.maxClients}  (status: ${p.status})`);
  console.log(`  ${staleTrial.length} trial plan(s) still carry a different cap`);

  section('4. Tier-derived plans whose cap differs from their tier / unknown tier');
  const derivedMismatch = [];
  const unknownTier = [];
  for (const p of plans) {
    if (p.maxClientsOverride === true) continue;
    const tier = tiers.get(p.plan);
    if (!tier) {
      unknownTier.push(p);
      continue;
    }
    if (p.maxClients !== tier.maxClients) derivedMismatch.push({ p, tier });
  }
  for (const { p, tier } of derivedMismatch) console.log(`  - ${p._id}  ${emailOf(p._id)}  tier "${p.plan}": plan ${p.maxClients} vs tier ${tier.maxClients}`);
  for (const p of unknownTier) console.log(`  - ${p._id}  ${emailOf(p._id)}  tier "${p.plan}" does not exist (maxClients ${p.maxClients})`);
  console.log(`  ${derivedMismatch.length} mismatched, ${unknownTier.length} on an unknown tier`);
  const staleTierKeys = [...new Set([...staleTrial.map((p) => p.plan), ...derivedMismatch.map(({ p }) => p.plan)])];
  if (staleTierKeys.length) actions.push(`Admin → Plans: open and re-save tier(s) ${staleTierKeys.join(', ')} (unchanged) — coachPlanTiers.save propagates maxClients to every non-overridden coach on that tier`);
  if (unknownTier.length) actions.push(`Move ${unknownTier.length} coach(es) on a non-existent tier via Admin → Coach → plan (coachPlans.adminUpdate)`);

  section('Recommended one-time actions (in this order)');
  if (!actions.length) console.log('  none — plan data is consistent');
  actions.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log('\nNothing was written.');
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
