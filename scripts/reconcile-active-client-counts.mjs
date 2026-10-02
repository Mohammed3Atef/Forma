/**
 * One-time (safe to re-run) reconciliation of `coachPlans.activeClientCount`.
 *
 * The counter is what the atomic client-cap gate (`reserveClientSlot`) reads,
 * so it must equal the number of ACTIVE `coachClients` relationships for the
 * coach. Historically it was a best-effort `$inc` (a failed bump was
 * swallowed), and plan docs created before the counter existed have none at
 * all — which the gate treats as "no plan" (refuses new clients).
 *
 * For every coachPlans doc this prints: coach id / email, stored count, real
 * count, difference, and whether the coach is over their cap. Coaches that
 * have active clients but NO plan doc are listed separately (fix those with
 * scripts/migrate-forma-single-plan.mjs first — nothing here creates a plan).
 *
 *   node scripts/reconcile-active-client-counts.mjs                 # dry run (default)
 *   node scripts/reconcile-active-client-counts.mjs --write --db=<MONGODB_DB>
 *
 * `--write` only takes effect when `--db=` names EXACTLY the database the
 * connection resolves to — a deliberate second confirmation of the
 * environment. Writes are compare-and-set on the stored value that was read,
 * so a counter that moved between the scan and the write is left alone (and
 * reported) rather than clobbered. Reads MONGODB_URI / MONGODB_DB from .env.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const dbArg = args.find((a) => a.startsWith('--db='))?.slice(5);
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'forma';

if (!uri) {
  console.error('Set MONGODB_URI (and MONGODB_DB) first.');
  process.exit(1);
}
if (WRITE && dbArg !== dbName) {
  console.error(`Refusing to write: pass --db=${dbName} to confirm the target database (got ${dbArg ?? 'nothing'}).`);
  process.exit(1);
}

function host(u) {
  try {
    return new URL(u.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://')).host;
  } catch {
    return '(unparseable uri)';
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  console.log(`Target: ${host(uri)} / database "${dbName}"  —  mode: ${WRITE ? 'WRITE' : 'DRY RUN'}\n`);

  const users = db.collection('users');
  const plans = db.collection('coachPlans');
  const rels = db.collection('coachClients');

  const realCounts = new Map(
    (await rels.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$coachId', n: { $sum: 1 } } }]).toArray()).map((r) => [r._id, r.n]),
  );
  const planDocs = await plans.find({}).toArray();
  const emails = new Map((await users.find({ role: 'coach' }, { projection: { email: 1 } }).toArray()).map((u) => [u._id, u.email]));

  const rows = [];
  for (const p of planDocs) {
    const stored = typeof p.activeClientCount === 'number' && Number.isFinite(p.activeClientCount) ? p.activeClientCount : null;
    const real = realCounts.get(p._id) ?? 0;
    rows.push({
      coach: p._id,
      email: emails.get(p._id) ?? '(no coach user!)',
      plan: p.plan ?? '?',
      stored,
      real,
      diff: stored === null ? 'MISSING' : real - stored,
      max: p.maxClients,
      overCap: typeof p.maxClients === 'number' && real > p.maxClients ? 'OVER CAP' : '',
    });
  }
  const mismatched = rows.filter((r) => r.diff !== 0);

  console.table(rows.map(({ coach, email, plan, stored, real, diff, max, overCap }) => ({ coach, email, plan, stored, real, diff, max, overCap })));
  console.log(`${planDocs.length} plan doc(s); ${mismatched.length} need a counter fix; ${rows.filter((r) => r.overCap).length} over cap.`);

  const orphaned = [...realCounts.entries()].filter(([coachId]) => !planDocs.some((p) => p._id === coachId));
  if (orphaned.length) {
    console.log('\nCoaches with ACTIVE clients but NO coachPlans doc (run scripts/migrate-forma-single-plan.mjs first, then re-run this):');
    for (const [coachId, n] of orphaned) console.log(`  - ${coachId}  ${emails.get(coachId) ?? '(no coach user!)'}  active clients: ${n}`);
  }

  if (!WRITE) {
    console.log('\nDry run only — nothing written. Re-run with --write --db=<name> to apply the counter fixes above.');
    await client.close();
    return;
  }

  let fixed = 0;
  let skipped = 0;
  const now = Date.now();
  for (const r of mismatched) {
    const filter = r.stored === null ? { _id: r.coach, activeClientCount: { $not: { $type: 'number' } } } : { _id: r.coach, activeClientCount: r.stored };
    const res = await plans.updateOne(filter, { $set: { activeClientCount: r.real, updatedAt: now } });
    if (res.matchedCount === 1) fixed += 1;
    else {
      skipped += 1;
      console.log(`  ! ${r.coach}: counter changed since the scan — left alone, re-run to reconcile.`);
    }
  }
  console.log(`\nFixed ${fixed} counter(s), skipped ${skipped}.`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
