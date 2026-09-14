/**
 * Seeds realistic multi-week historical activity (workouts, nutrition, cardio,
 * weight, measurements) for selected demo clients, via the real `sync.push`
 * tRPC procedure (the exact same one SyncEngine.ts uses) — so this is
 * indistinguishable, server-side, from a real client's device having synced
 * this history over the past N weeks. Deliberately non-linear (skipped days,
 * partial sessions, adherence variance) — see the per-client CONFIG below.
 *
 * Usage: node scripts/seed-demo-history.mjs
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { MongoClient } from 'mongodb';

const BASE = 'https://www.useforma.fit/api/trpc';
const SECRET = process.env.JWT_ACCESS_SECRET;
const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
const db = mongo.db('forma');

function sign(id, role) {
  return jwt.sign({ role, accountStatus: 'active' }, SECRET, { subject: id, expiresIn: '30m', algorithm: 'HS256' });
}
async function push(token, collection, records) {
  const res = await fetch(`${BASE}/sync.push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ collection, records }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`push ${collection} -> ${JSON.stringify(json.error)}`);
  return json.result.data;
}

const DAY = 86_400_000;
function dateKey(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { return new Date(Date.now() - n * DAY); }
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const SPLIT = [
  { dayId: 'push-day', exercises: ['bench-press', 'overhead-press', 'incline-db-press', 'lateral-raise', 'triceps-pushdown'] },
  { dayId: 'pull-day', exercises: ['deadlift', 'lat-pulldown', 'barbell-row', 'face-pull', 'barbell-curl'] },
  { dayId: 'legs-day', exercises: ['back-squat', 'romanian-deadlift', 'leg-press', 'leg-curl', 'calf-raise'] },
];

function makeSetLog(setIndex, type, targetReps, baseWeight, progressFactor, missed) {
  const done = !missed && Math.random() > 0.05;
  const actualReps = done ? Math.round(rand(Number(targetReps.split('-')[0]), Number(targetReps.split('-')[1] ?? targetReps.split('-')[0]) + 1)) : null;
  const weightKg = done ? Math.round((baseWeight * progressFactor + rand(-2, 2)) / 2.5) * 2.5 : null;
  return { setIndex, type, targetReps, actualReps, weightKg, rpe: done ? Math.round(rand(6, 9)) : null, done };
}

function makeWorkoutLog(date, dayIdx, progressFactor, mode) {
  const day = SPLIT[dayIdx % SPLIT.length];
  const finished = mode !== 'partial';
  const exercises = day.exercises.map((exerciseId, i) => {
    const isCompound = i === 0;
    const setCount = isCompound ? 4 : 3;
    const baseWeight = isCompound ? rand(60, 100) : rand(15, 40);
    const sets = Array.from({ length: setCount }, (_, si) =>
      makeSetLog(si, si === 0 ? 'warmup' : 'working', isCompound ? '5-8' : '8-12', baseWeight, progressFactor, mode === 'partial' && i > 1),
    );
    return { exerciseId, sets, done: sets.every((s) => s.done) };
  });
  const startedAt = new Date(date).setHours(17, 30, 0, 0);
  const durationSec = finished ? Math.round(rand(2700, 4500)) : Math.round(rand(600, 1500));
  return {
    id: dateKey(date), date: dateKey(date), dayId: day.dayId,
    startedAt, endedAt: finished ? startedAt + durationSec * 1000 : null, durationSec,
    exercises, finished, updatedAt: startedAt + durationSec * 1000,
  };
}

function makeNutritionLog(date, adherence) {
  const meals = ['breakfast', 'lunch', 'dinner', 'snack1', 'snack2'];
  const mealsEaten = {};
  for (const meal of meals) mealsEaten[meal] = Math.random() < adherence;
  return {
    id: dateKey(date), date: dateKey(date), mealsEaten,
    supplementsTaken: { multivitamin: Math.random() < adherence, omega3: Math.random() < adherence },
    customFoods: [], itemOverrides: {},
    extraItems: {}, waterMl: Math.round(rand(1500, 3200)), creatineTaken: Math.random() < adherence,
    updatedAt: new Date(date).setHours(21, 0, 0, 0),
  };
}

function makeCardioLog(date, type) {
  const durationSec = Math.round(rand(900, 2400));
  return {
    id: `cardio-${dateKey(date)}-${Math.random().toString(36).slice(2, 6)}`, date: dateKey(date), type,
    durationSec, distanceKm: type === 'walking' || type === 'running' ? Math.round(rand(2, 8) * 10) / 10 : null,
    caloriesBurned: Math.round(rand(150, 500)), steps: type === 'walking' ? Math.round(rand(4000, 9000)) : null,
    updatedAt: new Date(date).setHours(7, 0, 0, 0),
  };
}

/** Realistic non-linear weight trend: overall downward drift + day-to-day noise (never perfectly linear). */
function weightSeries(weeks, startKg, weeklyLossKg) {
  const points = [];
  let w = startKg;
  for (let week = 0; week < weeks; week += 1) {
    for (const dayOffset of [1, 4]) {
      const dayIndex = week * 7 + dayOffset;
      w -= weeklyLossKg / 2 + rand(-0.35, 0.35);
      points.push({ dayIndex, weightKg: Math.round(w * 10) / 10 });
    }
  }
  return points;
}

async function seedClientHistory(clientId, { weeks, startWeightKg, weeklyLossKg, adherenceBase, skipRate }) {
  const token = sign(clientId, 'client');
  const workoutRecords = [];
  const nutritionRecords = [];
  const cardioRecords = [];
  const weightRecords = [];
  const measurementRecords = [];

  let dayIdx = 0;
  for (let week = weeks - 1; week >= 0; week -= 1) {
    // 3 workout days/week (Sun/Tue/Thu-ish offsets), some skipped entirely.
    for (const offset of [0, 2, 4]) {
      const date = daysAgo(week * 7 + offset);
      if (Math.random() < skipRate) continue; // skipped workout (never logged)
      const mode = Math.random() < 0.12 ? 'partial' : 'finished';
      const progressFactor = 1 + (weeks - week) * 0.015; // slow progressive overload
      workoutRecords.push(makeWorkoutLog(date, dayIdx, progressFactor, mode));
      dayIdx += 1;
    }
    // nutrition logged most days
    for (let d = 0; d < 7; d += 1) {
      const date = daysAgo(week * 7 + d);
      if (Math.random() < skipRate * 0.6) continue;
      const adherence = Math.min(0.98, adherenceBase + rand(-0.15, 0.1));
      nutritionRecords.push(makeNutritionLog(date, adherence));
    }
    // cardio ~2x/week
    for (const offset of [1, 5]) {
      if (Math.random() < 0.25) continue;
      cardioRecords.push(makeCardioLog(daysAgo(week * 7 + offset), pick(['walking', 'incline_treadmill', 'cycling', 'intervals'])));
    }
  }
  for (const { dayIndex, weightKg } of weightSeries(weeks, startWeightKg, weeklyLossKg)) {
    const date = daysAgo(weeks * 7 - dayIndex);
    weightRecords.push({ id: dateKey(date), date: dateKey(date), weightKg, updatedAt: new Date(date).setHours(7, 30, 0, 0) });
  }
  // measurements every 2 weeks
  let waist = 90, chest = 100, arm = 34;
  for (let week = weeks - 1; week >= 0; week -= 2) {
    const date = daysAgo(week * 7);
    waist -= rand(0.3, 0.9); chest += rand(0.05, 0.3); arm += rand(0.05, 0.25);
    measurementRecords.push({
      id: dateKey(date), date: dateKey(date),
      values: { waist: Math.round(waist * 10) / 10, chest: Math.round(chest * 10) / 10, arm: Math.round(arm * 10) / 10 },
      updatedAt: new Date(date).setHours(8, 0, 0, 0),
    });
  }

  const map = (recs) => recs.map((r) => ({ id: r.id, updatedAt: r.updatedAt, data: r }));
  if (workoutRecords.length) await push(token, 'workoutLogs', map(workoutRecords));
  if (nutritionRecords.length) await push(token, 'nutritionLogs', map(nutritionRecords));
  if (cardioRecords.length) await push(token, 'cardioLogs', map(cardioRecords));
  if (weightRecords.length) await push(token, 'weightLogs', map(weightRecords));
  if (measurementRecords.length) await push(token, 'measurementLogs', map(measurementRecords));

  console.log(`  ${clientId}: ${workoutRecords.length} workouts, ${nutritionRecords.length} nutrition days, ${cardioRecords.length} cardio, ${weightRecords.length} weight points, ${measurementRecords.length} measurement snapshots`);
}

async function findId(email) {
  const u = await db.collection('users').findOne({ emailLower: email.toLowerCase() });
  if (!u) throw new Error(`not found: ${email}`);
  return u._id;
}

console.log('=== Seeding historical activity (workouts/nutrition/cardio/weight/measurements) ===\n');

const targets = [
  { email: process.env.E2E_CLIENT_EMAIL, weeks: 10, startWeightKg: 95.2, weeklyLossKg: 0.45, adherenceBase: 0.8, skipRate: 0.12, label: 'client@forma.test (main QA client)' },
  { email: 'demo.client01@forma.test', weeks: 2, startWeightKg: 78.0, weeklyLossKg: 0.3, adherenceBase: 0.65, skipRate: 0.25, label: 'Mostafa Adel (trial, short history)' },
  { email: 'demo.client05@forma.test', weeks: 8, startWeightKg: 88.5, weeklyLossKg: 0.5, adherenceBase: 0.85, skipRate: 0.1, label: 'Ahmed Kamal (recently renewed, consistent)' },
  { email: 'demo.client11@forma.test', weeks: 6, startWeightKg: 82.0, weeklyLossKg: 0.35, adherenceBase: 0.7, skipRate: 0.2, label: 'Tarek Fahmy (transfer-history demo client)' },
];

for (const t of targets) {
  console.log(`${t.label}:`);
  const id = await findId(t.email);
  await seedClientHistory(id, t);
}

console.log('\n=== History seeding complete ===');
await mongo.close();
