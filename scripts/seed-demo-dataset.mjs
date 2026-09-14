/**
 * Builds the persistent FORMA_DEMO_ / demo.* dataset for the full-product QA +
 * marketing-demo pass (see the conversation this was requested in). Calls the
 * REAL production tRPC API (https://www.useforma.fit/api/trpc) with signed
 * access tokens (same HS256 JWT the backend itself issues — built directly
 * from JWT_ACCESS_SECRET in .env, not by logging in through the UI, so this
 * script can act as any actor without needing every demo user's password).
 *
 * SAFE TO RE-RUN: every created record's email is prefixed `demo.` (coaches)
 * or `demo.client###@forma.test` (clients) — the script always creates FRESH
 * ones with a timestamp-free deterministic index, so re-running will attempt
 * to re-use existing demo coaches (skips signup on 409) but will create
 * DUPLICATE clients if run twice without clearing prior demo clients first.
 * This is intentional — the seeded records are meant to be kept permanently
 * for marketing/demo purposes, not torn down after each run.
 *
 * Usage: node scripts/seed-demo-dataset.mjs
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';

const BASE = 'https://www.useforma.fit/api/trpc';
const SECRET = process.env.JWT_ACCESS_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
if (!SECRET || !MONGODB_URI) throw new Error('Missing JWT_ACCESS_SECRET or MONGODB_URI in .env');

const mongo = new MongoClient(MONGODB_URI);
await mongo.connect();
const db = mongo.db('forma');

function sign(user) {
  return jwt.sign({ role: user.role, accountStatus: 'active' }, SECRET, { subject: user.id, expiresIn: '30m', algorithm: 'HS256' });
}

async function call(procedure, { token, input, method } = {}) {
  const isQuery = method === 'GET';
  const url = isQuery ? `${BASE}/${procedure}${input !== undefined ? `?input=${encodeURIComponent(JSON.stringify(input))}` : ''}` : `${BASE}/${procedure}`;
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (!isQuery) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method: isQuery ? 'GET' : 'POST', headers, body: isQuery ? undefined : JSON.stringify(input ?? {}) });
  const json = await res.json();
  if (json.error) throw new Error(`${procedure} -> ${JSON.stringify(json.error)}`);
  return json.result.data;
}
const q = (proc, token, input) => call(proc, { token, input, method: 'GET' });
const m = (proc, token, input) => call(proc, { token, input, method: 'POST' });

const DAY = 86_400_000;
const now = Date.now();

async function findUserByEmail(email) {
  return db.collection('users').findOne({ emailLower: email.toLowerCase() });
}

/** Signs up a demo coach if not present, else reuses the existing account. Returns {id, token}. */
async function ensureCoach(email, password, displayName) {
  let doc = await findUserByEmail(email);
  if (doc) {
    console.log(`  coach already exists: ${email} (${doc._id})`);
    return { id: doc._id, token: sign({ id: doc._id, role: 'coach' }) };
  }
  const signup = await m('auth.signup', undefined, { email, password, displayName, role: 'coach' });
  console.log(`  created coach: ${email} (${signup.user.id})`);
  return { id: signup.user.id, token: signup.accessToken };
}

/** Ensures a coach has a Layer-A plan at the given tier (creates trial then optionally upgrades via super-admin override). */
async function ensurePlan(coachToken, coachId, superToken, tier) {
  await m('coachPlans.createTrial', coachToken, {}).catch(() => undefined);
  if (tier !== 'trial') {
    await m('coachPlans.adminUpdate', superToken, { coachId, tier });
  }
}

/**
 * Creates one demo client via the REAL invite -> public claim flow (exactly
 * what a real client does), then (optionally) adjusts the resulting
 * subscription via updateSubscription to hit an exact target state/date —
 * setTerm doesn't accept an explicit status for expired, so "expired" is
 * reached the natural way (a real past endAt), not by forcing a status enum.
 */
async function createDemoClient(coachToken, coachId, { emailLocal, displayName, phone, invite, adjust }) {
  const email = `demo.client${emailLocal}@forma.test`;
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log(`  client already exists, skipping: ${email} (${existing._id})`);
    return { id: existing._id, email };
  }
  const inv = await m('invites.create', coachToken, invite);
  const claim = await m('invites.claim', undefined, { code: inv._id, email, phone, password: 'DemoClient123!', displayName });
  const clientId = claim.user.id;
  console.log(`  created client: ${displayName} <${email}> (${clientId}) status=${claim.relationship.subscription?.status}`);
  if (adjust) {
    await m('coachClients.updateSubscription', coachToken, { id: `${coachId}__${clientId}`, sub: adjust });
    console.log(`    adjusted subscription:`, JSON.stringify(adjust));
  }
  return { id: clientId, email };
}

console.log('=== Seeding Forma demo dataset (persistent — not cleaned up) ===\n');

// ---- Super admin (for tier overrides) ----
const superDoc = await findUserByEmail(process.env.E2E_SUPER_EMAIL);
if (!superDoc) throw new Error('E2E_SUPER_EMAIL account not found — run auth setup first');
const superToken = sign({ id: superDoc._id, role: 'super_admin' });

// ---- Coach A: the existing coach@forma.test (primary demo coach) ----
console.log('Coach A (primary demo coach, existing E2E account):');
const coachADoc = await findUserByEmail(process.env.E2E_COACH_EMAIL);
const coachA = { id: coachADoc._id, token: sign({ id: coachADoc._id, role: 'coach' }) };
await ensurePlan(coachA.token, coachA.id, superToken, 'pro');
console.log(`  coach@forma.test plan ensured at tier=pro\n`);

// ---- Coach B & C: new demo coaches ----
console.log('Coach B (demo.coachb@forma.test):');
const coachB = await ensureCoach('demo.coachb@forma.test', 'DemoCoachB123!', 'Nour Ali');
await ensurePlan(coachB.token, coachB.id, superToken, 'starter');
console.log('  plan ensured at tier=starter\n');

console.log('Coach C (demo.coachc@forma.test):');
const coachC = await ensureCoach('demo.coachc@forma.test', 'DemoCoachC123!', 'Hossam Zaki');
// Coach C stays on trial tier deliberately — a real "coach on trial" demo state —
// but still needs the trial coachPlans doc created, or coachAtClientCap treats a
// missing plan as "at cap" (fail-safe, by design — see api/coach-clients/_data.ts).
await ensurePlan(coachC.token, coachC.id, superToken, 'trial');
console.log('  left on trial tier (deliberate — coach-on-trial demo state)\n');

// ---- Demo clients: Coach A gets 6 new (client@forma.test will be assigned separately as client #7 via the real "assign unassigned client" UI flow) ----
console.log('Clients for Coach A:');
await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '01', displayName: 'Mostafa Adel', phone: '01001110001',
  invite: { subStatus: 'trial', subTrialDays: 14 },
});
await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '02', displayName: 'Nourhan Tarek', phone: '01001110002',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
  adjust: { op: 'setTerm', startAt: now - 40 * DAY, days: 30, price: 1000, currency: 'EGP', planName: 'Monthly' }, // endAt ~10 days ago -> expired
});
const youssef = await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '03', displayName: 'Youssef Hassan', phone: '01001110003',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
});
await m('coachClients.updateSubscription', coachA.token, { id: `${coachA.id}__${youssef.id}`, sub: { op: 'cancel' } });
console.log('    cancelled subscription for Youssef Hassan');

const salma = await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '04', displayName: 'Salma Nabil', phone: '01001110004',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1200, subCurrency: 'EGP', subPlanName: 'Monthly' },
});
await m('coachClients.updateSubscription', coachA.token, {
  id: `${coachA.id}__${salma.id}`, sub: { op: 'freeze', from: now, until: now + 14 * DAY, note: 'Traveling for work, requested a 2-week freeze.' },
});
console.log('    froze subscription for Salma Nabil (2 weeks)');

await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '05', displayName: 'Ahmed Kamal', phone: '01001110005',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
  adjust: { op: 'setTerm', startAt: now - 2 * DAY, days: 30, price: 1000, currency: 'EGP', planName: 'Monthly' }, // renewed 2 days ago
});
await createDemoClient(coachA.token, coachA.id, {
  emailLocal: '06', displayName: 'Mariam Adel', phone: '01001110006',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
  adjust: { op: 'setTerm', startAt: now - 28 * DAY, days: 30, price: 1000, currency: 'EGP', planName: 'Monthly' }, // renewal due in 2 days
});
console.log();

// ---- Demo clients: Coach B (4) ----
console.log('Clients for Coach B:');
await createDemoClient(coachB.token, coachB.id, {
  emailLocal: '07', displayName: 'Omar Fathy', phone: '01001110007',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1500, subCurrency: 'EGP', subPlanName: 'Monthly Premium' },
  adjust: { op: 'setTerm', startAt: now - 23 * DAY, days: 30, price: 1500, currency: 'EGP', planName: 'Monthly Premium' }, // due in 7 days
});
await createDemoClient(coachB.token, coachB.id, {
  emailLocal: '08', displayName: 'Hana Samir', phone: '01001110008',
  invite: { subStatus: 'active', subDays: 30, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
  adjust: { op: 'setTerm', startAt: now, days: 30, price: 1000, currency: 'EGP', planName: 'Monthly' }, // due in 30 days
});
await createDemoClient(coachB.token, coachB.id, {
  emailLocal: '09', displayName: 'Khaled Ibrahim', phone: '01001110009',
  invite: { subStatus: 'active', subMonths: 3, subPrice: 2800, subCurrency: 'EGP', subPlanName: '3-Month Program' },
});
await createDemoClient(coachB.token, coachB.id, {
  emailLocal: '10', displayName: 'Yara Mostafa', phone: '01001110010',
  invite: { subStatus: 'pending' },
});
console.log();

// ---- Demo clients: Coach C (3) ----
console.log('Clients for Coach C:');
await createDemoClient(coachC.token, coachC.id, {
  emailLocal: '11', displayName: 'Tarek Fahmy', phone: '01001110011',
  invite: { subStatus: 'active', subMonths: 2, subPrice: 1800, subCurrency: 'EGP', subPlanName: '2-Month Program' },
});
await createDemoClient(coachC.token, coachC.id, {
  emailLocal: '12', displayName: 'Rania Adel', phone: '01001110012',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
});
const sherif = await createDemoClient(coachC.token, coachC.id, {
  emailLocal: '13', displayName: 'Sherif Nabil', phone: '01001110013',
  invite: { subStatus: 'active', subMonths: 1, subPrice: 1000, subCurrency: 'EGP', subPlanName: 'Monthly' },
});
await m('coachClients.updateSubscription', coachC.token, { id: `${coachC.id}__${sherif.id}`, sub: { op: 'end' } });
console.log('    ended subscription for Sherif Nabil');

console.log('\n=== Seeding complete ===');
console.log('Coach A: coach@forma.test (existing) — tier pro, 6 new demo clients (+ client@forma.test to be assigned via UI)');
console.log('Coach B: demo.coachb@forma.test / DemoCoachB123! — tier starter, 4 demo clients');
console.log('Coach C: demo.coachc@forma.test / DemoCoachC123! — tier trial, 3 demo clients');
console.log('All demo client passwords: DemoClient123!');

await mongo.close();
