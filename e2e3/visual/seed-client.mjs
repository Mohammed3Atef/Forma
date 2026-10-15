/**
 * B2 visual QA — seed a REALISTIC client (clientA) into an isolated e2e3 stack
 * so screens are reviewed with real data density, not empty states:
 *   4-day upper/lower plan with sections, coach notes, rest, one playable video
 *   and real exercise images · a 4-meal nutrition plan with targets,
 *   supplements and swaps · 2.5 weeks of finished sessions · 8 weeks of weight
 *   · measurements · a cardio plan + logs · a short coach chat (one unread) ·
 *   a shared coach note · a requested check-in.
 *
 *   node e2e3/visual/seed-client.mjs <port>      (port of a running e2e3/env/server.mjs)
 *   node e2e3/visual/seed-client.mjs <port> --empty   (reset clientA to "coach connected, no plan")
 *
 * Only ever touches the run's in-memory isolated database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const PORT = process.argv[2] ?? '5251';
const EMPTY = process.argv.includes('--empty');
const env = JSON.parse(fs.readFileSync(path.join('e2e-out', `current-env-${PORT}.json`), 'utf8'));
if (!/127\.0\.0\.1|localhost/.test(env.mongoUri)) throw new Error('refusing: not a local isolated database');
if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(env.mongoUri)) throw new Error('Refusing to run: env file does not point at the isolated e2e3 database (loopback only).');
const client = await MongoClient.connect(env.mongoUri);
const db = client.db(env.dbName ?? 'forma_e2e');

const C = 'e2e-client-a';
const COACH = 'e2e-coach-a';
const DAY = 86_400_000;
const now = Date.now();
const cairo = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(t));
const today = cairo(now);
const dayKey = (offset) => cairo(now + offset * DAY);

async function reset(collection, filter) {
  await db.collection(collection).deleteMany(filter);
}

for (const [col, f] of [
  ['clientWorkoutPlans', { _id: C }],
  ['clientNutritionPlans', { _id: C }],
  ['clientCardioPlans', { _id: C }],
  ['coachTargets', { _id: C }],
  ['syncRecords', { clientId: C }],
  ['syncDeletions', { clientId: C }],
  ['messages', { clientId: C }],
  ['notifications', { clientId: C }],
  ['coachNotes', { clientId: C }],
  ['checkIns', { clientId: C }],
]) await reset(col, f);

if (EMPTY) {
  console.log('[seed] clientA reset: coach connected, no plan');
  await client.close();
  process.exit(0);
}

const IMG = (slug) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${slug}/0.jpg`;
const ex = (id, name, muscle, sets, reps, rest, extra = {}) => ({
  id, name, targetMuscle: muscle, warmupSets: '', warmupSetCount: 0, workingSets: sets, repRange: reps, rir: '2', tempo: '3-1-1',
  notes: { en: '', ar: '' }, restSec: rest, videoId: null, videoUrl: null, ...extra,
});
const exercises = {
  bench: ex('bench', 'Barbell Bench Press', 'chest', 3, '6-8', 150, {
    warmupSetCount: 2, warmupSets: '2',
    notes: { en: 'Pause each rep on the chest. Keep 1–2 reps in the tank.', ar: 'وقفة على الصدر في كل عدة. سيب عدة أو اتنين.' },
    imageUrl: IMG('Barbell_Bench_Press_-_Medium_Grip'),
    videoUrl: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
  }),
  incline: ex('incline', 'Incline Dumbbell Press', 'chest', 3, '8-10', 120, { imageUrl: IMG('Incline_Dumbbell_Press') }),
  row: ex('row', 'Chest-Supported Row', 'back', 3, '8-10', 120),
  lat: ex('lat', 'Lat Pulldown', 'back', 3, '10-12', 90, { imageUrl: IMG('Wide-Grip_Lat_Pulldown') }),
  lateral: ex('lateral', 'Cable Lateral Raise', 'shoulders', 3, '12-15', 60),
  pushdown: ex('pushdown', 'Triceps Rope Pushdown', 'triceps', 2, '12-15', 60),
  squat: ex('squat', 'Back Squat', 'quads', 3, '5-7', 180, {
    warmupSetCount: 2, warmupSets: '2',
    notes: { en: 'Brace before every rep. Depth over load.', ar: 'شد البطن قبل كل عدة. العمق أهم من الوزن.' },
    imageUrl: IMG('Barbell_Squat'),
  }),
  rdl: ex('rdl', 'Romanian Deadlift', 'hamstrings', 3, '8-10', 150, { imageUrl: IMG('Romanian_Deadlift') }),
  legpress: ex('legpress', 'Leg Press', 'quads', 3, '10-12', 120),
  curl: ex('curl', 'Seated Leg Curl', 'hamstrings', 3, '12-15', 75),
  calf: ex('calf', 'Standing Calf Raise', 'calves', 3, '12-15', 60),
  ohp: ex('ohp', 'Seated Dumbbell Shoulder Press', 'shoulders', 3, '8-10', 120),
  pullup: ex('pullup', 'Assisted Pull-up', 'back', 3, '6-8', 120),
  dbrow: ex('dbrow', 'One-Arm Dumbbell Row', 'back', 3, '10-12', 90),
  flye: ex('flye', 'Pec Deck', 'chest', 2, '12-15', 60),
  curlb: ex('curlb', 'EZ-Bar Curl', 'biceps', 2, '10-12', 60),
  hipthrust: ex('hipthrust', 'Barbell Hip Thrust', 'glutes', 3, '8-10', 120),
  split: ex('split', 'Bulgarian Split Squat', 'quads', 3, '8-10', 90),
  ext: ex('ext', 'Leg Extension', 'quads', 2, '12-15', 60),
};
const days = [
  { id: 'upper-a', dayIndex: 0, title: 'Upper A', focus: 'Chest · Back · Shoulders', exerciseIds: ['bench', 'row', 'incline', 'lat', 'lateral', 'pushdown'],
    sections: [{ id: 's1', title: 'Main lifts', kind: 'working', exerciseIds: ['bench', 'row'] }, { id: 's2', title: 'Accessories', kind: 'normal', exerciseIds: ['incline', 'lat', 'lateral', 'pushdown'] }] },
  { id: 'lower-a', dayIndex: 1, title: 'Lower A', focus: 'Quads · Hamstrings', exerciseIds: ['squat', 'rdl', 'legpress', 'curl', 'calf'] },
  { id: 'upper-b', dayIndex: 2, title: 'Upper B', focus: 'Back · Shoulders · Arms', exerciseIds: ['ohp', 'pullup', 'dbrow', 'flye', 'curlb'] },
  { id: 'lower-b', dayIndex: 3, title: 'Lower B', focus: 'Glutes · Quads', exerciseIds: ['hipthrust', 'split', 'ext', 'curl', 'calf'] },
];
await db.collection('clientWorkoutPlans').insertOne({
  _id: C, clientId: C, id: C, name: 'Upper / Lower — 4 days', days, exercises, updatedAt: now - 3 * DAY,
  meta: { assignedAt: now - 30 * DAY, assignedBy: COACH, isCustomized: true, sourceTemplateName: 'Upper / Lower' },
});

const food = (id, en, ar, quantity, p, c, f) => ({ id, name: { en, ar }, quantity, protein: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9) });
await db.collection('clientNutritionPlans').insertOne({
  _id: C, clientId: C, id: C, name: 'Cut — 2,050 kcal',
  meals: [
    { id: 'm-breakfast', slot: 'breakfast', label: { en: 'Breakfast', ar: 'الفطار' }, items: [food('f-oats', 'Oats', 'شوفان', '80 g', 10, 54, 6), food('f-whey', 'Whey protein', 'واي بروتين', '1 scoop', 24, 3, 2), food('f-banana', 'Banana', 'موز', '1 medium', 1, 27, 0)] },
    { id: 'm-lunch', slot: 'lunch', label: { en: 'Lunch', ar: 'الغدا' }, items: [food('f-chicken', 'Grilled chicken breast', 'صدر فراخ مشوي', '200 g', 46, 0, 5), food('f-rice', 'Basmati rice', 'أرز بسمتي', '150 g cooked', 4, 42, 1), food('f-salad', 'Mixed salad', 'سلطة خضرا', '1 bowl', 2, 8, 0)] },
    { id: 'm-snack', slot: 'snack', label: { en: 'Afternoon snack', ar: 'سناك العصر' }, items: [food('f-yogurt', 'Greek yogurt', 'زبادي يوناني', '200 g', 20, 8, 0), food('f-almonds', 'Almonds', 'لوز', '20 g', 4, 4, 10)] },
    { id: 'm-dinner', slot: 'dinner', label: { en: 'Dinner', ar: 'العشا' }, items: [food('f-salmon', 'Salmon fillet', 'سلمون', '170 g', 34, 0, 18), food('f-potato', 'Baked potato', 'بطاطس مشوية', '250 g', 5, 50, 0), food('f-veg', 'Steamed vegetables', 'خضار سوتيه', '1 cup', 3, 10, 0)] },
  ],
  targets: { calories: 2050, protein: 160, carbs: 200, fats: 60 },
  supplements: [{ id: 'sup-creatine', name: 'Creatine monohydrate', dose: { en: '5 g', ar: '5 جم' }, timing: { en: 'Any time', ar: 'أي وقت' } }, { id: 'sup-d3', name: 'Vitamin D3', dose: { en: '2000 IU', ar: '2000 وحدة' }, timing: { en: 'With lunch', ar: 'مع الغدا' } }],
  waterTargetMl: 3000,
  beverageNotes: [{ en: 'Black coffee and tea are fine — no sugar.', ar: 'القهوة والشاي من غير سكر عادي.' }],
  generalNotes: [{ en: 'Hit protein every day; carbs can move between meals.', ar: 'البروتين كل يوم أساسي، والكارب ممكن يتنقل بين الوجبات.' }],
  substitutionPolicy: { allowClientSubstitutions: true, allowCustomFoods: true, requireCoachApproval: false },
  updatedAt: now - 5 * DAY,
});
await db.collection('clientCardioPlans').insertOne({
  _id: C, clientId: C, id: C, name: 'Conditioning',
  sessions: [{ id: 'cs-walk', type: 'walking', durationMin: 40, frequency: '3×/week', notes: 'Zone 2 — you can still talk.' }, { id: 'cs-bike', type: 'cycling', durationMin: 20, frequency: 'After lower days', notes: 'Easy spin.' }],
  updatedAt: now - 10 * DAY,
});
await db.collection('coachTargets').insertOne({ _id: C, clientId: C, waterMl: 3000, steps: 9000, cardioMin: 30, updatedBy: COACH, updatedAt: now - 10 * DAY });

// --- history: finished sessions over the last 2.5 weeks (rotation through the 4 days) ---
const rec = (collection, recordId, data, ago = 0) => ({
  _id: `${C}__${collection}__${recordId}`, clientId: C, collection, recordId, data: { ...data, updatedAt: now - ago, dirty: false }, updatedAt: now - ago, syncedAt: now - ago, rev: 1, sv: 1,
});
const base = { bench: 72.5, row: 60, incline: 26, lat: 55, lateral: 9, pushdown: 25, squat: 95, rdl: 85, legpress: 160, curl: 40, calf: 70, ohp: 22, pullup: 20, dbrow: 30, flye: 45, curlb: 27.5, hipthrust: 110, split: 18, ext: 45 };
const sessions = [[-16, 0], [-14, 1], [-12, 2], [-9, 3], [-7, 0], [-5, 1], [-3, 2]];
const logs = sessions.map(([offset, di], n) => {
  const day = days[di];
  const date = dayKey(offset);
  const start = now + offset * DAY - 3 * 3600_000;
  return rec('workoutLogs', date, {
    id: date, date, dayId: day.id, startedAt: start, endedAt: start + 58 * 60_000, durationSec: 58 * 60, finished: true,
    exercises: day.exerciseIds.map((id) => {
      const e = exercises[id];
      const top = Number(e.repRange.split('-')[1]);
      return {
        exerciseId: id, done: true,
        sets: Array.from({ length: e.workingSets }, (_, i) => ({ setIndex: i, type: 'working', targetReps: e.repRange, actualReps: Math.max(5, top - i - (n % 2)), weightKg: base[id] + (n >= 4 ? 2.5 : 0), rpe: null, done: true })),
      };
    }),
  }, -offset * DAY);
});
const weights = Array.from({ length: 16 }, (_, i) => {
  const offset = -56 + i * 3.5;
  const date = dayKey(Math.round(offset));
  return rec('weightLogs', date, { id: date, date, weightKg: Math.round((82.6 - i * 0.19 + (i % 3 === 0 ? 0.3 : 0)) * 10) / 10 }, -offset * DAY);
});
const meas = [[-28, { waist: 88, chest: 104, arm: 36.5, hips: 101 }], [-7, { waist: 85.5, chest: 103, arm: 37, hips: 99.5 }]].map(([o, values]) => rec('measurementLogs', dayKey(o), { id: dayKey(o), date: dayKey(o), values }, -o * DAY));
const cardio = [[-6, 'walking', 2460, 4.1, 7200], [-4, 'cycling', 1260, 9.5, 0], [-1, 'walking', 2580, 4.3, 7600]].map(([o, type, sec, km, steps], i) => rec('cardioLogs', `cardio-${i}`, { id: `cardio-${i}`, date: dayKey(o), type, durationSec: sec, distanceKm: km, caloriesBurned: Math.round(sec / 60 * 5), steps }, -o * DAY));
await db.collection('syncRecords').insertMany([...logs, ...weights, ...meas, ...cardio]);

// --- coach relationship: chat, a shared note, notifications, a requested check-in ---
const msg = (i, from, body, minsAgo, seen = true) => ({ _id: `seed-msg-${i}`, clientId: C, coachId: COACH, fromUserId: from === 'coach' ? COACH : C, fromRole: from, body, seenAt: seen ? now - minsAgo * 60_000 + 30_000 : null, createdAt: now - minsAgo * 60_000, updatedAt: now - minsAgo * 60_000 });
await db.collection('messages').insertMany([
  msg(1, 'client', 'Bench felt heavy on the last set — should I drop the weight?', 60 * 26),
  msg(2, 'coach', 'Keep 72.5 kg and aim for 7 reps on all sets. We add load when you hit 8.', 60 * 25),
  msg(3, 'client', 'Got it. Squats felt great today 💪', 60 * 3),
  msg(4, 'coach', 'Love it. Check-in is open for this week — send it when you can.', 40, false),
]);
await db.collection('coachNotes').insertMany([
  { _id: 'seed-note-1', clientId: C, authorId: COACH, authorRole: 'coach', kind: 'note', visibility: 'client', body: 'Slow the lowering on bench — 3 seconds down.', screen: 'workout', entityType: 'exercise', entityId: 'bench', createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY },
  { _id: 'seed-note-2', clientId: C, authorId: COACH, authorRole: 'coach', kind: 'announcement', visibility: 'client', body: 'Deload week starts Saturday — same exercises, two sets each.', createdAt: now - 1 * DAY, updatedAt: now - 1 * DAY },
]);
await db.collection('notifications').insertMany([
  { _id: 'seed-n-1', clientId: C, forRole: 'client', type: 'coach_note', body: 'Slow the lowering on bench — 3 seconds down.', screen: 'workout', entityType: 'exercise', entityId: 'bench', noteVisibility: 'client', seenAt: null, resolvedAt: null, createdAt: now - 2 * DAY, createdBy: COACH, updatedAt: now - 2 * DAY },
  { _id: 'seed-n-2', clientId: C, forRole: 'client', type: 'message_received', body: 'Love it. Check-in is open for this week — send it when you can.', route: '/messages', seenAt: null, resolvedAt: null, createdAt: now - 40 * 60_000, createdBy: COACH, updatedAt: now - 40 * 60_000 },
]);
// Week starts on Saturday (the app's week strip runs Sat → Fri).
const dow = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
const weekStart = dayKey(-((dow + 1) % 7));
const weekEnd = dayKey(-((dow + 1) % 7) + 6);
await db.collection('checkIns').insertOne({ _id: `${C}__${weekStart}`, clientId: C, coachId: COACH, weekStart, weekEnd, status: 'requested', progressPhotos: {}, createdAt: now - 2 * 3600_000, updatedAt: now - 2 * 3600_000 });
await db.collection('notifications').insertOne({ _id: 'seed-n-3', clientId: C, forRole: 'client', type: 'checkin_requested', entityType: 'checkin', entityId: weekStart, route: `/check-in/${weekStart}`, seenAt: null, resolvedAt: null, createdAt: now - 2 * 3600_000, createdBy: COACH, updatedAt: now - 2 * 3600_000 });

console.log(`[seed] clientA seeded: plan (4 days), meals (4), ${logs.length} sessions, ${weights.length} weights, check-in ${weekStart}, today ${today}`);
await client.close();
