/**
 * DEMO SEED — realistic coaches + clients (photos, plans, and ~14 days of past
 * workout / nutrition / weight logs) for screenshots and a final manual test.
 *
 * SAFE BY DEFAULT: this is a DRY RUN unless you pass `--apply`. A dry run creates
 * nothing — it just prints exactly what would be written. All demo accounts are
 * tagged by email domain (DEMO_DOMAIN, default `forma-demo.test`) so they are
 * trivial to find and delete afterwards.
 *
 *   Dry run (no writes):
 *     SA_EMAIL=super@x SA_PASSWORD=*** node scripts/seed-demo.mjs
 *   Apply to LIVE Firebase (forma-14d33):
 *     SA_EMAIL=super@x SA_PASSWORD=*** node scripts/seed-demo.mjs --apply
 *
 * Env (optional): DEMO_DOMAIN, DEMO_PASSWORD, DEMO_SUFFIX (namespace a fresh
 * batch so re-running doesn't collide on existing emails).
 *
 * How it writes: signs in as a SUPER_ADMIN (primary app) which may write every
 * doc (users.manageStatus / coaches.assign / clients.writeAll). Auth users are
 * created on a SECONDARY app so the super-admin session is never disturbed.
 * Re-running with the same emails will hit "email-already-in-use" — use
 * DEMO_SUFFIX=2 (etc.) for a new batch, or delete the old demo users first.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};

const APPLY = process.argv.includes('--apply');
const SA_EMAIL = process.env.SA_EMAIL;
const SA_PASSWORD = process.env.SA_PASSWORD;
const DOMAIN = process.env.DEMO_DOMAIN || 'forma-demo.test';
const PASSWORD = process.env.DEMO_PASSWORD || 'FormaDemo!2026';
const SUFFIX = process.env.DEMO_SUFFIX || '';
if (!SA_EMAIL || !SA_PASSWORD) {
  console.error('Set SA_EMAIL and SA_PASSWORD (a super_admin). Add --apply to write to live.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const EXERCISES = JSON.parse(readFileSync(join(here, '..', 'public', 'data', 'exercise-library.json'), 'utf-8'));

// ---- helpers ----------------------------------------------------------------
let _c = 0;
const rid = (p) => `${p}_${Date.now().toString(36)}${(_c++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const dayKey = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
const photo = (email) => `https://i.pravatar.cc/300?u=${encodeURIComponent(email)}`;
const email = (slug) => `demo.${slug}${SUFFIX}@${DOMAIN}`;
const byMuscle = (m) => EXERCISES.filter((e) => e.targetMuscle === m);
const pick = (m, n) => byMuscle(m).slice(0, n);

/** A 3-day workout plan (Push/Pull/Legs) drawn from the real exercise dataset. */
function buildWorkoutPlan(coachId) {
  const dayDefs = [
    { title: 'Push', focus: 'Chest / Shoulders / Triceps', groups: [['Chest', 2], ['Shoulders', 2], ['Triceps', 1]] },
    { title: 'Pull', focus: 'Back / Biceps', groups: [['Lats', 1], ['Middle Back', 2], ['Biceps', 2]] },
    { title: 'Legs', focus: 'Quads / Hams / Calves', groups: [['Quadriceps', 2], ['Hamstrings', 2], ['Calves', 1]] },
  ];
  const exercises = {};
  const days = dayDefs.map((d, i) => {
    const picks = d.groups.flatMap(([m, n]) => pick(m, n));
    for (const e of picks) exercises[e.id] = { ...e, workingSets: 3, repRange: '8-12', restSec: 90 };
    return { id: `${rid('day')}`, dayIndex: i, title: d.title, focus: d.focus, exerciseIds: picks.map((e) => e.id) };
  });
  return { id: rid('wplan'), name: 'Hypertrophy — PPL', days, exercises, meta: { assignedAt: Date.now(), assignedBy: coachId, isCustomized: false }, updatedAt: Date.now() };
}

/** A simple 4-meal nutrition plan around a calorie/macro target. */
function buildMealPlan(coachId, targets) {
  const item = (en, ar, qty, p, c, f) => ({ id: rid('food'), name: { en, ar }, quantity: qty, protein: p, carbs: c, fats: f, calories: p * 4 + c * 4 + f * 9 });
  const meals = [
    { id: rid('meal'), slot: 'breakfast', label: { en: 'Breakfast', ar: 'الإفطار' }, items: [item('Oats', 'شوفان', '80 g', 10, 54, 5), item('Whey Protein', 'واي بروتين', '1 scoop', 24, 3, 2)] },
    { id: rid('meal'), slot: 'lunch', label: { en: 'Lunch', ar: 'الغداء' }, items: [item('Chicken Breast', 'صدر دجاج', '200 g', 62, 0, 7), item('White Rice', 'أرز أبيض', '200 g', 5, 56, 1)] },
    { id: rid('meal'), slot: 'snack', label: { en: 'Snack', ar: 'وجبة خفيفة' }, items: [item('Greek Yogurt', 'زبادي يوناني', '200 g', 20, 8, 1), item('Almonds', 'لوز', '28 g', 6, 6, 14)] },
    { id: rid('meal'), slot: 'dinner', label: { en: 'Dinner', ar: 'العشاء' }, items: [item('Salmon', 'سلمون', '180 g', 40, 0, 23), item('Sweet Potato', 'بطاطا حلوة', '200 g', 4, 42, 0)] },
  ];
  return {
    id: rid('mplan'), name: 'Balanced — High Protein', meals, targets,
    supplements: [{ id: rid('supp'), name: 'Creatine', dose: { en: '5 g daily', ar: '٥ جم يوميًا' } }],
    waterTargetMl: 3000, beverageNotes: [], generalNotes: [],
    meta: { assignedAt: Date.now(), assignedBy: coachId, isCustomized: false }, updatedAt: Date.now(),
  };
}

/** ~14 days of logs: workout 4×/week (cycling plan days), nutrition daily, weight every 3rd day. */
function buildLogs(plan, startWeight, goal) {
  const workoutDayIdx = new Set([1, 2, 4, 5]); // Mon/Tue/Thu/Fri-ish by day-of-week
  const out = { workoutLogs: [], nutritionLogs: [], weightLogs: [] };
  let cycle = 0;
  for (let d = 14; d >= 0; d--) {
    const date = dayKey(d);
    const dow = new Date(date).getUTCDay();
    if (workoutDayIdx.has(dow)) {
      const day = plan.days[cycle % plan.days.length];
      cycle++;
      const exercises = day.exerciseIds.map((exId) => ({
        exerciseId: exId,
        done: true,
        sets: Array.from({ length: 3 }, (_, s) => ({ setIndex: s, type: 'working', targetReps: '8-12', actualReps: 10 - s, weightKg: 40 + s * 5, rpe: 8, done: true })),
      }));
      out.workoutLogs.push({ id: date, date, dayId: day.id, startedAt: Date.now(), endedAt: Date.now(), durationSec: 3600, exercises, finished: true, updatedAt: Date.now(), dirty: false });
    }
    const mealsEaten = {};
    plan._mealIds.forEach((id, i) => { mealsEaten[id] = i < 3; }); // ate most meals
    out.nutritionLogs.push({ id: date, date, mealsEaten, supplementsTaken: {}, customFoods: [], itemOverrides: {}, extraItems: {}, waterMl: 2500, creatineTaken: true, updatedAt: Date.now(), dirty: false });
    if (d % 3 === 0) {
      const drift = goal === 'fat_loss' ? d * 0.1 : -d * 0.08; // trending toward the goal over time
      out.weightLogs.push({ id: date, date, weightKg: Math.round((startWeight + drift) * 10) / 10, updatedAt: Date.now(), dirty: false });
    }
  }
  return out;
}

// ---- demo roster ------------------------------------------------------------
const ROSTER = [
  { slug: 'coach-sara', name: 'Sara Khaled', tier: 'pro', clients: [
    { slug: 'client-omar', name: 'Omar Hassan', goal: 'muscle_gain', age: 27, weight: 78, height: 180 },
    { slug: 'client-lina', name: 'Lina Adel', goal: 'fat_loss', age: 31, weight: 68, height: 165 },
    { slug: 'client-youssef', name: 'Youssef Nabil', goal: 'recomp', age: 24, weight: 82, height: 178 },
  ] },
  { slug: 'coach-ahmed', name: 'Ahmed Fathy', tier: 'enterprise', clients: [
    { slug: 'client-mariam', name: 'Mariam Tarek', goal: 'fat_loss', age: 29, weight: 72, height: 168 },
    { slug: 'client-karim', name: 'Karim Soliman', goal: 'strength', age: 33, weight: 90, height: 183 },
    { slug: 'client-nour', name: 'Nour Hossam', goal: 'muscle_gain', age: 22, weight: 60, height: 170 },
  ] },
  { slug: 'coach-mona', name: 'Mona Saleh', tier: 'starter', clients: [
    { slug: 'client-hana', name: 'Hana Wael', goal: 'maintenance', age: 35, weight: 64, height: 162 },
    { slug: 'client-tarek', name: 'Tarek Magdy', goal: 'muscle_gain', age: 28, weight: 75, height: 176 },
  ] },
];

const TIER_CAP = { trial: 10, starter: 25, pro: 100, enterprise: 1000 };

// ---- run --------------------------------------------------------------------
const primary = initializeApp(firebaseConfig, 'demo-primary');
const secondary = initializeApp(firebaseConfig, 'demo-secondary');
const db = initializeFirestore(primary, { ignoreUndefinedProperties: true });
const saAuth = getAuth(primary);
const newAuth = getAuth(secondary);

const write = async (path, data) => {
  if (!APPLY) return;
  await setDoc(doc(db, ...path), data);
};
const createAuth = async (slug) => {
  const e = email(slug);
  if (!APPLY) return `dry_${slug}`;
  const cred = await createUserWithEmailAndPassword(newAuth, e, PASSWORD);
  return cred.user.uid;
};

async function main() {
  console.log(`\n${APPLY ? '⚠️  APPLY MODE — writing to LIVE forma-14d33' : '🟢 DRY RUN — no writes'}  (domain: ${DOMAIN}, suffix: "${SUFFIX}")\n`);
  if (APPLY) {
    await signInWithEmailAndPassword(saAuth, SA_EMAIL, SA_PASSWORD);
    console.log('Signed in as super_admin.');
  }

  const now = Date.now();
  let coaches = 0, clients = 0, logs = 0;

  for (const c of ROSTER) {
    const coachId = await createAuth(c.slug);
    const cEmail = email(c.slug);
    await write(['users', coachId], { id: coachId, role: 'coach', email: cEmail, displayName: c.name, phone: '+201000000000', photoUrl: photo(cEmail), accountStatus: 'active', permissions: [], createdBy: 'demo-seed', createdAt: now, updatedAt: now });
    await write(['coachPlans', coachId], { coachId, plan: c.tier, status: 'active', maxClients: TIER_CAP[c.tier], startedAt: now, endsAt: null, activeClientCount: c.clients.length, trialNotified: {}, createdAt: now, updatedAt: now });
    coaches++;
    console.log(`Coach ${c.name} (${c.tier}, cap ${TIER_CAP[c.tier]}) — ${c.clients.length} clients  [${cEmail}]`);

    for (const cl of c.clients) {
      const clientId = await createAuth(cl.slug);
      const clEmail = email(cl.slug);
      await write(['users', clientId], { id: clientId, role: 'client', email: clEmail, displayName: cl.name, phone: '+201000000001', photoUrl: photo(clEmail), accountStatus: 'active', permissions: [], assignedCoachId: coachId, createdBy: 'demo-seed', createdAt: now, updatedAt: now });
      await write(['coachClients', `${coachId}__${clientId}`], { id: `${coachId}__${clientId}`, coachId, clientId, status: 'active', subscription: { startAt: now - 30 * 86_400_000, endAt: now + 60 * 86_400_000, status: 'active', months: 3, price: 1500, currency: 'EGP', updatedAt: now }, createdBy: coachId, createdAt: now, updatedAt: now });
      await write(['clientData', clientId, 'profile', 'main'], { id: clientId, name: cl.name, age: cl.age, weightKg: cl.weight, heightCm: cl.height, goal: cl.goal, activityLevel: 'moderate', locale: 'en', createdAt: now, updatedAt: now });
      await write(['clientData', clientId, 'profile', 'assessment'], { completed: true, completedAt: now, status: 'reviewed', submittedAt: now, reviewedAt: now, reviewedBy: coachId, completionPercentage: 100, updatedAt: now, basic: { name: cl.name, age: cl.age, heightCm: cl.height, weightKg: cl.weight }, goals: { primary: cl.goal }, lifestyle: {}, training: {}, health: {}, nutrition: {}, motivation: {}, progressPhotos: {} });

      const wplan = buildWorkoutPlan(coachId);
      const targets = cl.goal === 'fat_loss' ? { calories: 1800, protein: 150, carbs: 150, fats: 60 } : { calories: 2600, protein: 180, carbs: 280, fats: 80 };
      const mplan = buildMealPlan(coachId, targets);
      const planForLogs = { days: wplan.days, _mealIds: mplan.meals.map((m) => m.id) };
      await write(['clientData', clientId, 'plan', 'workout'], wplan);
      await write(['clientData', clientId, 'plan', 'nutrition'], mplan);

      const l = buildLogs(planForLogs, cl.weight, cl.goal);
      for (const w of l.workoutLogs) await write(['clientData', clientId, 'workoutLogs', w.id], w);
      for (const n of l.nutritionLogs) await write(['clientData', clientId, 'nutritionLogs', n.id], n);
      for (const wt of l.weightLogs) await write(['clientData', clientId, 'weightLogs', wt.id], wt);
      logs += l.workoutLogs.length + l.nutritionLogs.length + l.weightLogs.length;
      clients++;
      console.log(`  • ${cl.name} (${cl.goal}) — plan + ${l.workoutLogs.length} workouts, ${l.nutritionLogs.length} nutrition, ${l.weightLogs.length} weight logs  [${clEmail}]`);
    }
  }

  console.log(`\n${APPLY ? 'Wrote' : 'Would write'}: ${coaches} coaches, ${clients} clients, ${logs} day-logs. Demo password: ${PASSWORD}`);
  if (!APPLY) console.log('Re-run with --apply to write to live Firebase.');
  process.exit(0);
}

main().catch((e) => { console.error('SEED FAILED:', e?.code || '', e?.message || e); process.exit(1); });
