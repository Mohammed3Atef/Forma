/**
 * Seeds a small demo dataset against the LIVE Mongo-backed API (not direct
 * Mongo writes) — exercises the real signup → invite → claim flow end to end,
 * which doubles as a smoke test of the new backend. Creates one demo coach
 * and a few demo clients (each actually claims a real invite, same as a real
 * user would).
 *
 *   API_BASE="http://localhost:3000" node scripts/seed-mongo-demo.mjs [--dry-run]
 *
 * API_BASE defaults to http://localhost:3000 (a `vercel dev` server). Point it
 * at a deployed URL to seed a hosted environment instead.
 *
 * Safe to re-run: skips creating the demo coach if that email already exists;
 * always creates fresh demo clients (each with a unique email) so re-running
 * just adds more sample clients rather than erroring.
 */
import 'dotenv/config';

const DRY = process.argv.includes('--dry-run');
const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const DEMO_COACH_EMAIL = process.env.DEMO_COACH_EMAIL || 'demo.coach@forma.test';
const DEMO_COACH_PASSWORD = process.env.DEMO_COACH_PASSWORD || 'DemoCoach123!';
const CLIENT_COUNT = Number(process.env.DEMO_CLIENT_COUNT || 3);

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${json?.error ?? text}`);
  return json;
}

async function main() {
  console.log(`Seeding demo data against ${API_BASE} ${DRY ? '(dry run — will not write)' : ''}`);
  if (DRY) {
    console.log(`Would sign up coach ${DEMO_COACH_EMAIL} and claim ${CLIENT_COUNT} demo client invite(s).`);
    return;
  }

  let coachToken;
  let coachId;
  try {
    const signup = await api('/auth/signup', {
      method: 'POST',
      body: { email: DEMO_COACH_EMAIL, password: DEMO_COACH_PASSWORD, displayName: 'Demo Coach', role: 'coach' },
    });
    coachToken = signup.accessToken;
    coachId = signup.user.id;
    console.log(`Created demo coach ${DEMO_COACH_EMAIL} (${coachId}).`);
  } catch (e) {
    if (String(e.message).includes('409')) {
      const login = await api('/auth/login', { method: 'POST', body: { email: DEMO_COACH_EMAIL, password: DEMO_COACH_PASSWORD } });
      coachToken = login.accessToken;
      coachId = login.user.id;
      console.log(`Demo coach already exists — signed in as ${DEMO_COACH_EMAIL} (${coachId}).`);
    } else {
      throw e;
    }
  }

  await api('/coach-plans/trial', { method: 'POST', token: coachToken }).catch(() => undefined);

  for (let i = 1; i <= CLIENT_COUNT; i += 1) {
    const invite = await api('/invites', {
      method: 'POST',
      token: coachToken,
      body: { subStatus: 'trial', subTrialDays: 14 },
    });
    const email = `demo.client${Date.now()}${i}@forma.test`;
    const code = invite._id;
    const claim = await api('/invites/claim', {
      method: 'POST',
      body: { code, email, phone: `0100000${1000 + i}`, password: 'DemoClient123!', displayName: `Demo Client ${i}` },
    });
    console.log(`  Client ${i}: ${email} (${claim.user.id}) claimed invite ${code}.`);
  }

  console.log('\nDone. Sign in as the demo coach with:');
  console.log(`  email:    ${DEMO_COACH_EMAIL}`);
  console.log(`  password: ${DEMO_COACH_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
