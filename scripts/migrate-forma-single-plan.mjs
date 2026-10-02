/**
 * Forma single-plan migration — REPORT by default, writes only with explicit
 * confirmation. NOT run against production as part of the refactor (Phase 4).
 *
 *   node scripts/migrate-forma-single-plan.mjs                         # dry run: report only
 *   node scripts/migrate-forma-single-plan.mjs --write --db <name> --i-understand
 *
 * --write additionally requires `--db` to equal MONGODB_DB exactly and the
 * `--i-understand` flag, so it can never run against an unconfirmed database.
 *
 * What it reports (and, with --write, fixes):
 *   1. Forma config doc (`coachPlanTiers/forma`) missing → created from the
 *      seed (25 clients, 499 EGP / month, 15-day trial). Legacy tier docs
 *      ('trial', 'pro', …) are LISTED only — they are inert now (nothing reads
 *      them) and left in place.
 *   2. Coach plans on a legacy tier key ('pro', 'starter', …) → plan 'forma'.
 *   3. Plans without the capacity breakdown → baseMaxClients / add-on 0 /
 *      manual adjustment. NEVER silently reduces anyone: a coach whose
 *      current limit is ABOVE the base gets the difference as an explicit,
 *      noted manual adjustment (e.g. 50 vs base 25 → +25 "migration").
 *   4. Paid plans with no subscription snapshot → snapshot from the legacy
 *      tier's price (or the Forma config), requestId 'legacy-migration'.
 *   5. Actionable requests of retired types (new_signup / trial_upgrade /
 *      plan_change) → cancelled with a note (never deleted); remaining
 *      actionable requests without a requestKey get 'subscription'.
 *   6. Coach accounts in accountStatus 'pending' whose plan is an ended
 *      Trial (the old grace-period pend) → REPORTED only; un-pend them from
 *      Admin → Users after review (the new model never pends on expiry).
 *
 * Never touches users' data, messages, client activity, logs, check-ins or
 * photos. Prints the target environment, collection counts and every
 * affected row before doing anything.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const dbArg = args.includes('--db') ? args[args.indexOf('--db') + 1] : undefined;
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';
if (!uri) {
  console.error('Set MONGODB_URI (and MONGODB_DB) first.');
  process.exit(1);
}
if (WRITE && (dbArg !== dbName || !args.includes('--i-understand'))) {
  console.error(`--write needs --db ${dbName} (must equal MONGODB_DB) and --i-understand. Refusing.`);
  process.exit(1);
}

const DAY_MS = 86_400_000;
const SEED = {
  _id: 'forma',
  label: 'Forma',
  trialEnabled: true,
  trialDurationDays: 15,
  trialClientLimit: null,
  maxClients: 25,
  priceMonthly: 499,
  currency: 'EGP',
  billingInterval: 'month',
  termDays: 30,
  publicVisible: true,
  signupEnabled: true,
  marketingTitle: { en: 'Forma', ar: 'فورما' },
  marketingDescription: { en: 'One plan. Everything included.', ar: 'خطة واحدة. كل شيء مشمول.' },
};
const RETIRED_TYPES = ['new_signup', 'trial_upgrade', 'plan_change'];

const host = (() => {
  try {
    return new URL(uri.replace(/^mongodb\+srv:/, 'http:').replace(/^mongodb:/, 'http:')).hostname;
  } catch {
    return '(unparseable)';
  }
})();

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`${WRITE ? 'WRITE' : 'DRY RUN (no writes)'} — host ${host}, database "${dbName}"`);

  const names = ['users', 'coachPlans', 'coachPlanTiers', 'coachPlanRequests', 'coachCapacityPackages', 'coachCapacityEntitlements', 'coachClients'];
  console.log('\nCollection counts:');
  for (const n of names) console.log(`  ${n.padEnd(28)} ${await db.collection(n).countDocuments()}`);

  const tiers = db.collection('coachPlanTiers');
  const plans = db.collection('coachPlans');
  const reqs = db.collection('coachPlanRequests');
  const users = db.collection('users');
  const now = Date.now();

  // 1. Forma config
  const forma = await tiers.findOne({ _id: 'forma' });
  const legacyTiers = await tiers.find({ _id: { $ne: 'forma' } }).toArray();
  console.log(`\n1. Forma config: ${forma ? 'present' : 'MISSING → will be created from seed'}`);
  for (const t of legacyTiers) console.log(`   legacy tier (inert, left in place): ${t._id}  maxClients=${t.maxClients} price=${t.priceMonthly} ${t.currency ?? ''}`);
  const cfg = { ...SEED, ...(forma ?? {}) };
  const legacyPrice = new Map(legacyTiers.map((t) => [t._id, { price: t.priceMonthly, currency: t.currency ?? cfg.currency }]));
  if (WRITE && !forma) await tiers.insertOne({ ...SEED, marketingFeatures: { en: [], ar: [] }, createdAt: now, updatedAt: now });

  // 2–4. Plans
  const all = await plans.find({}).toArray();
  const emails = new Map((await users.find({ _id: { $in: all.map((p) => p._id) } }, { projection: { email: 1, accountStatus: 1 } }).toArray()).map((u) => [u._id, u]));
  const who = (id) => `${id} ${emails.get(id)?.email ?? '(no user)'}`;
  console.log('\n2–4. Coach plans:');
  let touched = 0;
  for (const p of all) {
    const isTrial = p.plan === 'trial';
    const set = {};
    const notes = [];
    if (!isTrial && p.plan !== 'forma') {
      set.plan = 'forma';
      notes.push(`plan ${p.plan} → forma`);
    }
    if (typeof p.baseMaxClients !== 'number') {
      const base = isTrial ? cfg.trialClientLimit ?? cfg.maxClients : cfg.maxClients;
      const current = typeof p.maxClients === 'number' ? p.maxClients : base;
      set.baseMaxClients = base;
      set.addonClientCapacity = 0;
      if (current > base) {
        set.manualCapacityAdjustment = current - base;
        set.manualCapacityNote = { reason: `migration: preserved previous limit ${current}`, by: 'migration', at: now };
        notes.push(`limit ${current} > base ${base} → manual +${current - base} (no reduction)`);
      } else {
        set.manualCapacityAdjustment = 0;
        if (current < base) notes.push(`limit ${current} < base ${base} → raised to ${base}`);
      }
      set.maxClients = Math.max(current, base);
    }
    if (!isTrial && !p.subscription) {
      const lp = legacyPrice.get(p.plan) ?? { price: cfg.priceMonthly, currency: cfg.currency };
      set.subscription = { priceMonthly: lp.price, currency: lp.currency, billingInterval: 'month', termDays: cfg.termDays, maxClients: cfg.maxClients, requestId: 'legacy-migration' };
      notes.push(`subscription snapshot ${lp.price} ${lp.currency} (legacy-migration)`);
    }
    if (!Object.keys(set).length) continue;
    touched += 1;
    console.log(`   - ${who(p._id)}: ${notes.join('; ') || 'capacity fields initialised'}`);
    if (WRITE) {
      await plans.updateOne(
        { _id: p._id },
        { $set: { ...set, updatedAt: now }, $push: { history: { at: now, action: 'migration.forma_single_plan', detail: notes.join('; '), by: 'migration' } } },
      );
    }
  }
  console.log(`   ${touched} of ${all.length} plan(s) affected`);

  // 5. Requests
  const retired = await reqs.find({ type: { $in: RETIRED_TYPES }, status: { $in: ['awaiting', 'processing'] } }).toArray();
  const keyless = await reqs.find({ type: { $nin: RETIRED_TYPES }, requestKey: { $exists: false }, status: { $in: ['awaiting', 'processing'] } }).toArray();
  console.log(`\n5. Requests: ${retired.length} actionable retired-type request(s) → cancelled; ${keyless.length} actionable without requestKey → 'subscription'`);
  for (const r of retired) console.log(`   - cancel ${r._id} (${r.type}) for ${who(r.coachId)}`);
  if (WRITE) {
    if (retired.length) await reqs.updateMany({ _id: { $in: retired.map((r) => r._id) } }, { $set: { status: 'cancelled', cancelledAt: now, adminNote: 'Retired by the Forma single-plan migration' } });
    for (const r of keyless) {
      await reqs.updateOne({ _id: r._id }, { $set: { requestKey: r.capacitySnapshot ? `capacity:${r.capacitySnapshot.packageId}` : 'subscription' } }).catch((e) => console.warn(`   ! ${r._id}: ${e.message}`));
    }
    await reqs.dropIndex('uniq_coachId_actionable').catch(() => undefined);
  }

  // 6. Pended coaches
  const pended = all.filter((p) => p.plan === 'trial' && p.endsAt != null && p.endsAt <= now && emails.get(p._id)?.accountStatus === 'pending');
  console.log(`\n6. ${pended.length} coach account(s) pending with an ended Trial (old grace pend) — REPORT ONLY, review & un-pend manually:`);
  for (const p of pended) console.log(`   - ${who(p._id)} (trial ended ${Math.round((now - p.endsAt) / DAY_MS)}d ago)`);

  console.log(WRITE ? '\nDone (writes applied). Run scripts/mongo-init-indexes.mjs next.' : '\nDry run complete — nothing was written.');
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
