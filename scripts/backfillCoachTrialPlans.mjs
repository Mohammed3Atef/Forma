/**
 * One-time backfill: gives every existing coach with NO `coachPlans` doc a
 * real, configured Trial plan (active, no CoachPlanRequest — a free Trial
 * never needs payment confirmation). Never touches a coach who already has a
 * plan of any kind (idempotent upsert via `$setOnInsert`, same as the
 * server's own `ensureTrialPlan`).
 *
 * Defaults to a DRY RUN — prints exactly which coaches would be touched
 * (count + id + email) without writing anything. Pass --apply to actually
 * write.
 *
 *   node scripts/backfillCoachTrialPlans.mjs [--apply]
 *
 * MONGODB_URI / MONGODB_DB are read from .env automatically (via dotenv).
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';

if (!uri) {
  console.error('Set MONGODB_URI first.');
  process.exit(1);
}

const TRIAL_MAX_CLIENTS = 10;
const TRIAL_DURATION_DAYS = 15;
const DAY_MS = 86_400_000;

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection('users');
  const plans = db.collection('coachPlans');
  const tiers = db.collection('coachPlanTiers');

  const trialTier = await tiers.findOne({ _id: 'trial' });
  const maxClients = trialTier?.maxClients ?? TRIAL_MAX_CLIENTS;
  const trialDurationDays = trialTier?.trialDurationDays ?? TRIAL_DURATION_DAYS;

  const coaches = await users.find({ role: 'coach' }).toArray();
  const planned = [];
  for (const coach of coaches) {
    const existing = await plans.findOne({ _id: coach._id });
    if (existing) continue;
    planned.push(coach);
  }

  console.log(`Found ${coaches.length} coach account(s); ${planned.length} have no plan yet.`);
  for (const coach of planned) console.log(`  - ${coach._id}  ${coach.email}`);

  if (!APPLY) {
    console.log('\nDry run only — pass --apply to create these Trial plans.');
    await client.close();
    return;
  }

  const now = Date.now();
  for (const coach of planned) {
    const doc = {
      _id: coach._id,
      plan: 'trial',
      status: 'active',
      maxClients,
      startedAt: now,
      endsAt: now + trialDurationDays * DAY_MS,
      trialNotified: {},
      activeClientCount: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    // Idempotent — a concurrent/duplicate run can never clobber a plan created since the scan above.
    await plans.updateOne({ _id: coach._id }, { $setOnInsert: doc }, { upsert: true });
  }
  console.log(`\nCreated ${planned.length} Trial plan(s).`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
