import type { Exercise, WorkoutPlan } from '@/types';

/**
 * Parsed from the coaching Google Sheet (gid=1520884540) — a Push / Pull / Legs
 * split. Exercise notes are bilingual; Arabic is a faithful gloss of the coach's
 * English cues. Each exercise references a videoId; the actual video URLs are
 * imported separately (see videoAssets.seed.ts and the Import screen).
 */

type SeedExercise = Omit<Exercise, 'videoId'> & { videoId: string };

function ex(
  id: string,
  name: string,
  targetMuscle: string,
  notesEn: string,
  notesAr: string,
  opts: Partial<Pick<Exercise, 'warmupSets' | 'workingSets' | 'repRange' | 'rir' | 'tempo' | 'restSec'>> = {},
): SeedExercise {
  return {
    id,
    name,
    targetMuscle,
    warmupSets: opts.warmupSets ?? '1 set',
    workingSets: opts.workingSets ?? 2,
    repRange: opts.repRange ?? '8-12',
    rir: opts.rir ?? '0',
    tempo: opts.tempo ?? '1:02:01',
    restSec: opts.restSec ?? 90,
    notes: { en: notesEn, ar: notesAr },
    videoId: `vid_${id}`,
  };
}

const mobility = {
  warmupSets: '1 set, 15-20 reps',
  workingSets: 0,
  repRange: '15-20',
  rir: '-',
  tempo: '-',
  restSec: 45,
};

// --- Day 1: Push -----------------------------------------------------------
const push: SeedExercise[] = [
  ex('lat_stretch_er', 'Lat stretch with external rotation', 'Shoulder mobility',
    'Keep movement tempo slow, treat like a working set, focus on each rep.',
    'حافظ على إيقاع بطيء، عاملها كأنها مجموعة عمل وركز في كل عدة.', mobility),
  ex('upside_down_kb', 'Upside-down kettlebell hold', 'Shoulder stability',
    'Grip the kettlebell firmly, maintain balance in the positive and the negative.',
    'امسك الكيتل بل بقوة وحافظ على التوازن في الرفع والإنزال.', mobility),
  ex('rope_crunch', 'Rope crunch', 'Abs',
    'Perform flexion and extension of the spine from above.',
    'اعمل ثني ومد للعمود الفقري من أعلى.'),
  ex('incline_db_press', 'Incline dumbbell press', 'Chest',
    'Raise the bench one degree only, no arch in the back, elbows at 45 degrees.',
    'ارفع البنش درجة واحدة فقط، بدون تقويس الظهر، الكوع 45 درجة.'),
  ex('peck_deck', 'Pec deck machine', 'Chest',
    "Keep the seat one degree only, don't raise the shoulders, squeeze the chest.",
    'اضبط الكرسي درجة واحدة، لا ترفع الكتف، اعصر الصدر.'),
  ex('chest_press_machine', 'Chest press machine', 'Chest',
    'Adjust the seat so hands are at mid-chest, squeeze the chest together.',
    'اضبط الكرسي بحيث تكون اليدين عند منتصف الصدر واعصر الصدر.'),
  ex('db_lateral_raise', 'Dumbbell lateral raise', 'Shoulders',
    'Sit at 90 degrees, no arch, move arms in the 45-degree scapular plane.',
    'اجلس بزاوية 90، بدون تقويس، حرك الذراع في المستوى الكتفي 45 درجة.'),
  ex('tricep_overhead', 'Tricep overhead extension', 'Triceps',
    "Cable at hip level so the weight doesn't pull the shoulders back.",
    'الكابل عند مستوى الورك حتى لا يسحب الوزن الكتف للخلف.'),
  ex('db_front_raise', 'Dumbbell front raise', 'Shoulders',
    'Imagine lifting from below, not pushing the dumbbells forward.',
    'تخيل أنك ترفع من أسفل، لا تدفع الدمبل للأمام.'),
  ex('tricep_pushdown', 'Tricep push-down', 'Triceps',
    'Arms beside the body, not in front or behind.',
    'الذراعين بجانب الجسم، ليست أمام أو خلف.'),
];

// --- Day 2: Pull -----------------------------------------------------------
const pull: SeedExercise[] = [
  ex('scapula_pulls', 'Single-arm scapula pulls', 'Scapula mobility',
    'Allow the shoulder blade to move freely.',
    'اترك لوح الكتف يتحرك بحرية.', mobility),
  ex('scapula_retractions', 'Scapula retractions', 'Scapula mobility',
    'Allow the shoulder blade to move freely.',
    'اترك لوح الكتف يتحرك بحرية.', mobility),
  ex('back_extension', 'Back extension', 'Lower back',
    'Stabilise the core, flex at the lower back, adjust the angle at the hip.',
    'ثبّت الكور، اثنِ من أسفل الظهر، اضبط الزاوية عند الورك.'),
  ex('low_row_close', 'Seated low row, close grip', 'Lats',
    'Stabilise the back, pull the hands beside the body slightly outside.',
    'ثبّت الظهر، اسحب اليدين بجانب الجسم وللخارج قليلاً.'),
  ex('low_row_wide', 'Seated low row, wide grip', 'Upper back',
    'Stabilise the back, engage the core, pull under the chest, elbows wide.',
    'ثبّت الظهر، شدّ الكور، اسحب تحت الصدر، الكوع للخارج.'),
  ex('lat_pulldown_wide', 'Lat pulldown, wide grip', 'Lats',
    "Don't arch, elbows at 45 degrees, imagine driving into the torso.",
    'لا تقوّس، الكوع 45 درجة، تخيل أنك تسحب نحو الجذع.'),
  ex('rear_delt_fly', 'Rear delt fly machine', 'Shoulders',
    'Slight upper-back flex, pull from front to side, arms extended.',
    'ثني بسيط لأعلى الظهر، اسحب من الأمام للجانب، الذراعين ممدودتين.'),
  ex('seated_db_curl', 'Seated dumbbell biceps curl', 'Biceps',
    'Arms beside the body, focus on the negative, hold at the midpoint.',
    'الذراعين بجانب الجسم، ركز على الإنزال، اثبت عند المنتصف.'),
  ex('db_shrugs', 'Dumbbell shrugs', 'Traps',
    'Upper-back flex, arms just hold the dumbbells, shrug the shoulders up.',
    'شدّ أعلى الظهر، الذراعين تحمل الدمبل فقط، ارفع الكتف لأعلى.'),
  ex('machine_preacher_curl', 'Machine preacher curl', 'Biceps',
    'Adjust the seat for a comfortable shoulder, focus on the negative and hold.',
    'اضبط الكرسي لراحة الكتف، ركز على الإنزال واثبت.'),
];

// --- Day 3: Legs -----------------------------------------------------------
const legs: SeedExercise[] = [
  ex('deep_lunge_rockbacks', 'Deep lunge rockbacks', 'Lower mobility', '—', '—', mobility),
  ex('ankle_mobility', 'Ankle mobility', 'Lower mobility', '—', '—', mobility),
  ex('hip_cars', 'Hip CARs', 'Lower mobility', '—', '—', mobility),
  ex('adductor_machine', 'Adductor machine', 'Adductors',
    'Back straight on the pad (not sliding), hips forward, control the negative.',
    'الظهر مستقيم على الوسادة، الورك للأمام، تحكم في الإنزال.', { tempo: '-' }),
  ex('leg_press', 'Leg press machine', 'Quads',
    'Secure position, glutes touching the pad not floating, extend slowly.',
    'وضعية ثابتة، المؤخرة ملامسة للوسادة، مد ببطء.', { tempo: '-', restSec: 120 }),
  ex('lying_curl', 'Lying leg curl', 'Hamstrings',
    'Knee behind the pad always, control the negative rep well.',
    'الركبة خلف الوسادة دائماً، تحكم جيداً في الإنزال.', { tempo: '-' }),
  ex('leg_extension', 'Leg extension', 'Quads',
    'Full range of motion (not shortened); extend the knee, do not push forward.',
    'مدى حركة كامل، مدّ الركبة ولا تدفع للأمام.', { tempo: '-' }),
  ex('rdl_db', 'Romanian deadlift (dumbbell)', 'Hamstrings',
    'Slight knee bend and stabilise it; the dumbbells stay close to the legs.',
    'ثني بسيط للركبة وثبّتها، الدمبل قريب من الساق.', { tempo: '-', restSec: 120 }),
  ex('seated_calves', 'Seated calf machine', 'Calves',
    'Place the half forefoot on the pad, raise the heel up not forward.',
    'ضع نصف مقدمة القدم على الوسادة، ارفع الكعب لأعلى لا للأمام.', { tempo: '-' }),
  ex('leg_raises', 'Leg raises', 'Abs',
    'Focus on hip rotation.', 'ركز على دوران الورك.', { tempo: '-' }),
];

const allExercises = [...push, ...pull, ...legs];
const exercises: Record<string, Exercise> = Object.fromEntries(
  allExercises.map((e) => [e.id, e]),
);

export const SEED_WORKOUT_PLAN: WorkoutPlan = {
  id: 'plan_m3e_ppl',
  name: 'M3E — Push / Pull / Legs',
  updatedAt: 0,
  weeklyVolume: {
    chest: '12 sets',
    back: '18 sets',
    shoulder: '12 sets',
    arm: '8 sets',
    legs: '12 sets',
    abs: '6 sets',
  },
  exercises,
  // 3-day Push / Pull / Legs split; the user repeats the cycle each week.
  days: [
    {
      id: 'day_push_1',
      dayIndex: 0,
      title: 'Push',
      focus: 'Chest · Shoulders · Triceps',
      exerciseIds: push.map((e) => e.id),
    },
    {
      id: 'day_pull_1',
      dayIndex: 1,
      title: 'Pull',
      focus: 'Back · Biceps',
      exerciseIds: pull.map((e) => e.id),
    },
    {
      id: 'day_legs',
      dayIndex: 2,
      title: 'Legs',
      focus: 'Quads · Hamstrings · Calves',
      exerciseIds: legs.map((e) => e.id),
    },
  ],
};

export const SEED_EXERCISE_LIST = allExercises;
