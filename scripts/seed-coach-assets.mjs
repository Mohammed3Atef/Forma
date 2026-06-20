/**
 * One-time seed: signs in as a coach and writes a starter exercise library,
 * three workout templates (Push/Pull/Legs from the client's sheet + Upper/Lower
 * + Full Body), and a food library into coachAssets/{coachId}/…
 *
 * Run:  SEED_EMAIL=moatef@gmail.com SEED_PASSWORD=123123 node scripts/seed-coach-assets.mjs
 *
 * Re-running ADDS fresh copies (random ids) — run once. Writes go to the live
 * forma-14d33 project under the signed-in coach's own assets.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4V746POLUsz5IsaAlRRA6p-3QO1HpM9Y',
  authDomain: 'forma-14d33.firebaseapp.com',
  projectId: 'forma-14d33',
  storageBucket: 'forma-14d33.firebasestorage.app',
  messagingSenderId: '1099068388494',
  appId: '1:1099068388494:web:8910e9d7d9b247e5a305df',
};

const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set SEED_EMAIL and SEED_PASSWORD env vars.');
  process.exit(1);
}

let counter = 0;
const uid = (p = 'id') => {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${p}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
};

// ---- exercise catalog (from the coach's sheet) ------------------------------
// type 'mobility' = warm-up/mobility drill (1 light set, 15-20); 'working' = main lift.
const SPECS = {
  // Push
  latStretch: { name: 'Lat stretch with external rotation', muscle: 'Shoulder mobility', type: 'mobility', ar: 'خلي تيمبو الحركه بطيء كأنك بتلعب مجموعة شغل واهتم بكل عدة', en: 'Slow tempo — treat it like a working set, focus each rep.' },
  upsideKb: { name: 'Upside-down KB hold', muscle: 'Shoulder stability', type: 'mobility', ar: 'امسك الكتل بل كويس وركز يكون في توازن في العدة الإيجابية والسلبية', en: 'Grip the bell hard, stay balanced through the whole rep.' },
  ropeCrunch: { name: 'Rope crunch', muscle: 'Abs', type: 'working', ar: 'المطلوب تني وفرد في العمود الفقري من فوق', en: 'Flex and extend through the upper spine.' },
  inclineDbPress: { name: 'Incline DB press', muscle: 'Chest', type: 'working', ar: 'ارفع الدكة درجة واحدة، متعملش آرتش بضهرك، الكوع زاوية 45 مع جسمك', en: 'Bench one notch up, no back arch, elbows ~45° to torso.' },
  peckDeck: { name: 'Pec deck machine', muscle: 'Chest', type: 'working', ar: 'خلي الكرسي درجة واحدة، مترفعش كتفك، تخيل انك بتعصر الصدر', en: 'Seat one notch up, no shrug, squeeze the pecs.' },
  chestPressMachine: { name: 'Chest press machine', muscle: 'Chest', type: 'working', ar: 'ظبط الكرسي بحيث القبضة في نص صدرك، اعصر الصدر مع بعض', en: 'Handles at mid-chest, squeeze the pecs together.' },
  dbLateralRaise: { name: 'DB lateral raise', muscle: 'Shoulders', type: 'working', ar: 'اقعد على دكة 90، متعملش آرتش، حرّك بزاوية 45 scapular plane', en: 'Seated at 90°, no swing, raise in the scapular plane.' },
  tricepOverhead: { name: 'Tricep overhead extension', muscle: 'Triceps', type: 'working', ar: 'البكرة في مستوى حوضك، الوزن ميسحبش كتفك لورا، الكوع مريح', en: 'Cable at hip height, keep the elbow fixed and shoulder set.' },
  dbFrontRaise: { name: 'DB front raise', muscle: 'Shoulders', type: 'working', ar: 'تخيل انك بترفع حاجة من تحت لفوق مش بتزق الدمبل لقدام', en: 'Lift up from below — don\'t push the dumbbells forward.' },
  tricepPushdown: { name: 'Tricep push-down', muscle: 'Triceps', type: 'working', ar: 'كل المطلوب الكوع جمبك لا قدام ولا ورا', en: 'Keep elbows pinned at your sides.' },
  // Pull
  scapulaPulls: { name: 'Single-arm scapula pulls', muscle: 'Scapula mobility', type: 'mobility', ar: 'سيب لوح كتفك يتحرك براحته', en: 'Let the scapula move freely.' },
  scapulaRetractions: { name: 'Scapula retractions', muscle: 'Scapula mobility', type: 'mobility', ar: 'سيب لوح كتفك يتحرك براحته', en: 'Let the scapula move freely.' },
  backExtension: { name: 'Back extension', muscle: 'Lower back', type: 'working', ar: 'ثبّت الكور، تني في أول الحركة وظبط الزاوية على حوضك', en: 'Brace the core, hinge from the hip, set the angle.' },
  rowCloseGrip: { name: 'Seated low row (close grip)', muscle: 'Lats', type: 'working', ar: 'ثبّت ضهرك، اسحب لجنبك وبرا شوية', en: 'Stiff torso, pull to your side and slightly out.' },
  rowWideGrip: { name: 'Seated low row (wide grip)', muscle: 'Upper back', type: 'working', ar: 'ثبّت ضهرك، شد الكور، اسحب تحت صدرك والكوع مفتوح', en: 'Brace core, pull under the chest, elbows flared.' },
  latPulldownWide: { name: 'Lat pulldown (wide grip)', muscle: 'Lats', type: 'working', ar: 'متعملش آرتش، تخيل انك بتغرس الكوع في جذعك', en: 'No arch — drive the elbows into your sides.' },
  rearDeltFly: { name: 'Rear delt fly machine', muscle: 'Shoulders', type: 'working', ar: 'تني بسيط في الضهر وتخيل انك بتجيب حاجة من قدامك لجنبك والدراع مفرود', en: 'Slight torso lean, sweep hands front-to-side, arms long.' },
  seatedBicepCurl: { name: 'Seated DB bicep curl', muscle: 'Biceps', type: 'working', ar: 'ايدك جنبك، اهتم بالعدة السلبية واعمل hold ثواني في النص', en: 'Arms by sides, focus the eccentric, pause mid-rep.' },
  dbShrugs: { name: 'DB shrugs', muscle: 'Traps', type: 'working', ar: 'تني في أول الحركة، الايد مجرد ماسكة الدمبل، زق بكتفك لفوق', en: 'Slight hinge, hands just hold — shrug straight up.' },
  preacherCurl: { name: 'Machine preacher curl', muscle: 'Biceps', type: 'working', ar: 'ظبط الكرسي للكتف المريح، اهتم بالسلبية وعمل hold في النص', en: 'Set the seat for a comfy shoulder, focus the eccentric.' },
  // Legs
  lungeRockbacks: { name: 'Deep lunge rockbacks', muscle: 'Lower mobility', type: 'mobility', ar: 'حركة إطالة وتجهيز للأرجل', en: 'Controlled mobility drill for the lower body.' },
  ankleMobility: { name: 'Ankle mobility', muscle: 'Lower mobility', type: 'mobility', ar: 'حركة إطالة وتجهيز للكاحل', en: 'Controlled ankle mobility drill.' },
  hipCars: { name: 'Hip CARs', muscle: 'Lower mobility', type: 'mobility', ar: 'حركة إطالة وتجهيز للحوض', en: 'Controlled hip rotation drill.' },
  adductorMachine: { name: 'Adductor machine', muscle: 'Adductors', type: 'working', ar: 'ضهرك مستقيم على المسند، الحوض مش مزحلق، اعمل كنترول على العدة', en: 'Back flat on the pad, control the rep.' },
  legPress: { name: 'Leg press machine', muscle: 'Quads', type: 'working', ar: 'ثبّت نفسك، الجلوتس لامسة المسند، افرد الركبة براحة', en: 'Brace, glutes on the pad, extend without slamming lockout.' },
  lyingCurl: { name: 'Lying leg curl', muscle: 'Hamstrings', type: 'working', ar: 'ركبتك ورا المسند، اتحكم في الجزء السلبي', en: 'Knees behind the pad, control the eccentric.' },
  legExtension: { name: 'Leg extension', muscle: 'Quads', type: 'working', ar: 'مدى حركي كامل مش مقصوص، افرد الركبة', en: 'Full range, fully extend the knee.' },
  rdlDb: { name: 'DB Romanian deadlift', muscle: 'Hamstrings', type: 'working', ar: 'تني خفيف في الركبة وثبّته، الدمبل قريب من رجلك والفليكشن من الحوض', en: 'Slight knee bend, dumbbells close, hinge from the hips.' },
  seatedCalf: { name: 'Seated calf machine', muscle: 'Calves', type: 'working', ar: 'حط نص مشط رجلك، ارفع الكعب لفوق مش لقدام', en: 'Ball of foot on the plate, drive the heel up.' },
  legRaises: { name: 'Leg raises', muscle: 'Abs', type: 'working', ar: 'ركز مع روتيشن الحوض', en: 'Focus on the pelvic rotation.' },
};

// Exercise name → explanation-video URL (the "فيديو الشرح" links from the sheet).
const VIDEO = {
  'Lat stretch with external rotation': 'https://youtu.be/OkaZ-rz4oCM',
  'Upside-down KB hold': 'https://youtu.be/W91JnnJftu4',
  'Rope crunch': 'https://youtu.be/ToJeyhydUxU',
  'Incline DB press': 'https://youtube.com/shorts/ou6s32mJgjU',
  'Pec deck machine': 'https://youtube.com/shorts/a9vQ_hwIksU',
  'Chest press machine': 'https://youtu.be/vnd-GBtTMLI',
  'DB lateral raise': 'https://youtube.com/shorts/FIQt9pqinXc',
  'Tricep overhead extension': 'https://youtube.com/shorts/9Ark9S11uXw',
  'DB front raise': 'https://youtube.com/shorts/9ThlTL25DH8',
  'Tricep push-down': 'https://youtube.com/shorts/uOyF0ko4YBE',
  'Single-arm scapula pulls': 'https://youtu.be/p3xhgMqkPwg',
  'Scapula retractions': 'https://youtu.be/CTgiuFLPb0s',
  'Back extension': 'https://youtube.com/shorts/EKNRR9cSy9E',
  'Seated low row (close grip)': 'https://youtube.com/shorts/4VNYJzgw3QA',
  'Lat pulldown (wide grip)': 'https://youtube.com/shorts/77bPLrsMwiQ',
  'Rear delt fly machine': 'https://youtube.com/shorts/7tgx6QHB0-A',
  'Seated DB bicep curl': 'https://youtube.com/shorts/T8Y43hvPTEg',
  'DB shrugs': 'https://youtube.com/shorts/dwTcBceq-wI',
  'Machine preacher curl': 'https://youtube.com/shorts/S4dDLfp3e8w',
  'Deep lunge rockbacks': 'https://youtu.be/ig1tAGCidAM',
  'Ankle mobility': 'https://youtu.be/RZk374P3rhQ',
  'Hip CARs': 'https://youtu.be/TG3TVtblJzQ',
  'Adductor machine': 'https://youtube.com/shorts/BmMmt-c9aNM',
  'Leg press machine': 'https://youtube.com/shorts/EotSw18oR9w',
  'Lying leg curl': 'https://youtube.com/shorts/EfeVvA1vdd4',
  'Leg extension': 'https://youtube.com/shorts/iQ92TuvBqRo',
  'DB Romanian deadlift': 'https://youtube.com/shorts/CBOhr6H7BEY',
  'Seated calf machine': 'https://youtube.com/shorts/8BkvUI5i3EY',
  'Leg raises': 'https://youtube.com/shorts/1XgbnXtOUvk',
};

function mkEx(key) {
  const s = SPECS[key];
  const mob = s.type === 'mobility';
  return {
    id: uid('ex'),
    name: s.name,
    targetMuscle: s.muscle,
    warmupSets: mob ? '0' : '1',
    warmupSetCount: mob ? 0 : 1,
    workingSets: mob ? 1 : 2,
    repRange: mob ? '15-20' : '8-12',
    rir: mob ? '' : '0',
    tempo: mob ? '' : '1:02:01',
    notes: { en: s.en, ar: s.ar },
    restSec: mob ? 30 : 90,
    videoId: null,
    videoUrl: VIDEO[s.name] ?? null,
    category: s.muscle,
  };
}

// A workout day = mobility drills + working lifts, grouped into two sections.
function buildDay(dayIndex, title, focus, mobilityKeys, workingKeys) {
  const exercises = {};
  const mobIds = [];
  const workIds = [];
  for (const k of mobilityKeys) { const ex = mkEx(k); exercises[ex.id] = ex; mobIds.push(ex.id); }
  for (const k of workingKeys) { const ex = mkEx(k); exercises[ex.id] = ex; workIds.push(ex.id); }
  const sections = [];
  if (mobIds.length) sections.push({ id: uid('sec'), title: 'Warm-up / Mobility', kind: 'mobility', exerciseIds: mobIds });
  if (workIds.length) sections.push({ id: uid('sec'), title: 'Working', kind: 'working', exerciseIds: workIds });
  return {
    day: { id: uid('day'), dayIndex, title, focus, exerciseIds: [...mobIds, ...workIds], sections },
    exercises,
  };
}

function buildTemplate(coachId, name, goal, splitType, dayDefs) {
  const days = [];
  const exercises = {};
  dayDefs.forEach((d, i) => {
    const built = buildDay(i, d.title, d.focus, d.mobility ?? [], d.working ?? []);
    days.push(built.day);
    Object.assign(exercises, built.exercises);
  });
  const now = Date.now();
  return { id: uid('wtpl'), coachId, name, goal, splitType, days, exercises, createdAt: now, updatedAt: now };
}

// ---- food library -----------------------------------------------------------
const F = (en, ar, quantity, calories, protein, carbs, fats, category) => ({
  id: uid('food'), name: { en, ar }, quantity, calories, protein, carbs, fats, category,
});
const FOODS = [
  F('White rice (cooked)', 'أرز أبيض مطبوخ', '100g', 130, 2.7, 28, 0.3, 'Carbs'),
  F('Rice flour', 'دقيق أرز', '100g', 366, 6, 80, 1.4, 'Carbs'),
  F('Sweet potato (cooked)', 'بطاطا مسلوقة', '100g', 90, 2, 21, 0.1, 'Carbs'),
  F('Potato (cooked)', 'بطاطس مسلوقة', '100g', 87, 2, 20, 0.1, 'Carbs'),
  F('Oats', 'شوفان', '100g', 389, 17, 66, 7, 'Carbs'),
  F('Chicken breast (cooked)', 'صدور فراخ مطبوخة', '100g', 165, 31, 0, 3.6, 'Proteins'),
  F('Lean beef (cooked)', 'لحم بقري قليل الدهن', '100g', 217, 26, 0, 12, 'Proteins'),
  F('Tuna (in water)', 'تونة في الماء', '100g', 116, 26, 0, 1, 'Proteins'),
  F('Salmon', 'سلمون', '100g', 208, 20, 0, 13, 'Proteins'),
  F('Whole egg', 'بيضة كاملة', '1 egg (50g)', 72, 6.3, 0.4, 4.8, 'Proteins'),
  F('Egg white', 'بياض بيض', '100g', 52, 11, 0.7, 0.2, 'Proteins'),
  F('Greek yogurt', 'زبادي يوناني', '100g', 59, 10, 3.6, 0.4, 'Proteins'),
  F('Whey protein', 'واي بروتين', '1 scoop (30g)', 120, 24, 3, 1.5, 'Proteins'),
  F('Almonds', 'لوز', '100g', 579, 21, 22, 50, 'Fats'),
  F('Peanut butter', 'زبدة فول سوداني', '100g', 588, 25, 20, 50, 'Fats'),
  F('Olive oil', 'زيت زيتون', '1 tbsp (15g)', 119, 0, 0, 13.5, 'Fats'),
  F('Strawberry', 'فراولة', '100g', 32, 0.7, 7.7, 0.3, 'Fruits'),
  F('Banana', 'موز', '100g', 89, 1.1, 23, 0.3, 'Fruits'),
  F('Cucumber', 'خيار', '100g', 15, 0.7, 3.6, 0.1, 'Vegetables'),
  F('Bell peppers', 'فلفل ألوان', '100g', 31, 1, 6, 0.3, 'Vegetables'),
  F('Broccoli', 'بروكلي', '100g', 34, 2.8, 7, 0.4, 'Vegetables'),
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const auth = getAuth(app);

  console.log(`Signing in as ${EMAIL}…`);
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD);
  const coachId = cred.user.uid;
  console.log(`Signed in. coachId = ${coachId}`);

  // 1) Exercise library — one instance of each catalog exercise.
  const libIds = Object.keys(SPECS);
  for (const k of libIds) {
    const ex = mkEx(k);
    await setDoc(doc(db, 'coachAssets', coachId, 'exercises', ex.id), ex);
  }
  console.log(`✓ Library: ${libIds.length} exercises`);

  // 2) Three workout templates.
  const templates = [
    buildTemplate(coachId, 'Push / Pull / Legs', 'hypertrophy', 'ppl', [
      { title: 'Push', focus: 'Chest · Shoulders · Triceps', mobility: ['latStretch', 'upsideKb'], working: ['ropeCrunch', 'inclineDbPress', 'peckDeck', 'chestPressMachine', 'dbLateralRaise', 'tricepOverhead', 'dbFrontRaise', 'tricepPushdown'] },
      { title: 'Pull', focus: 'Back · Rear delts · Biceps', mobility: ['scapulaPulls', 'scapulaRetractions'], working: ['backExtension', 'rowCloseGrip', 'rowWideGrip', 'latPulldownWide', 'rearDeltFly', 'seatedBicepCurl', 'dbShrugs', 'preacherCurl'] },
      { title: 'Legs', focus: 'Quads · Hamstrings · Calves · Abs', mobility: ['lungeRockbacks', 'ankleMobility', 'hipCars'], working: ['adductorMachine', 'legPress', 'lyingCurl', 'legExtension', 'rdlDb', 'seatedCalf', 'legRaises'] },
    ]),
    buildTemplate(coachId, 'Upper / Lower', 'hypertrophy', 'upper_lower', [
      { title: 'Upper', focus: 'Chest · Back · Shoulders · Arms', mobility: ['latStretch', 'scapulaRetractions'], working: ['inclineDbPress', 'chestPressMachine', 'latPulldownWide', 'rowWideGrip', 'dbLateralRaise', 'seatedBicepCurl', 'tricepPushdown'] },
      { title: 'Lower', focus: 'Quads · Hamstrings · Calves · Abs', mobility: ['ankleMobility', 'hipCars'], working: ['legPress', 'rdlDb', 'legExtension', 'lyingCurl', 'adductorMachine', 'seatedCalf', 'legRaises'] },
    ]),
    buildTemplate(coachId, 'Full Body', 'beginner', 'full_body', [
      { title: 'Full Body A', focus: 'Whole body', mobility: ['latStretch'], working: ['chestPressMachine', 'latPulldownWide', 'legPress', 'dbLateralRaise', 'seatedBicepCurl', 'ropeCrunch'] },
      { title: 'Full Body B', focus: 'Whole body', mobility: ['scapulaRetractions'], working: ['inclineDbPress', 'rowWideGrip', 'lyingCurl', 'tricepPushdown', 'legExtension', 'legRaises'] },
      { title: 'Full Body C', focus: 'Whole body', mobility: ['hipCars'], working: ['peckDeck', 'backExtension', 'rdlDb', 'rearDeltFly', 'seatedCalf', 'ropeCrunch'] },
    ]),
  ];
  for (const tpl of templates) {
    await setDoc(doc(db, 'coachAssets', coachId, 'workoutTemplates', tpl.id), tpl);
    console.log(`✓ Template: ${tpl.name} (${tpl.days.length} days)`);
  }

  // 3) Food library.
  for (const food of FOODS) {
    await setDoc(doc(db, 'coachAssets', coachId, 'foods', food.id), food);
  }
  console.log(`✓ Foods: ${FOODS.length}`);

  console.log('\nDone. Refresh the coach app → Library / Templates to see them.');
  process.exit(0);
}

main().catch((e) => {
  console.error('SEED FAILED:', e?.code || '', e?.message || e);
  process.exit(1);
});
