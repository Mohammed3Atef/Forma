import type { Exercise, LibraryFood, WorkoutGoal, SplitType } from '@/types';

/**
 * Static starter content for new coaches ("Load starter library"). Seeded into
 * `coachAssets/{coachId}` via starterLibraryApi with DETERMINISTIC ids
 * (`seed-*`) so re-running overwrites rather than duplicating. Everything is
 * fully editable/deletable by the coach afterwards; assigning to clients still
 * snapshots independently. No runtime/external API — all local.
 *
 * Exercise names are single-locale per the schema; instructions (`notes`) are
 * bilingual. Foods are fully bilingual.
 */

// ---- Exercises -------------------------------------------------------------

function ex(
  slug: string,
  name: string,
  targetMuscle: string,
  category: string,
  equipment: string,
  en: string,
  ar: string,
  o: Partial<Exercise> = {},
): Exercise {
  return {
    id: `seed-ex-${slug}`,
    name,
    targetMuscle,
    category,
    equipment,
    warmupSets: o.warmupSets ?? '1–2 light sets',
    workingSets: o.workingSets ?? 3,
    repRange: o.repRange ?? '8–12',
    rir: o.rir ?? '2',
    tempo: o.tempo ?? '2:0:1',
    restSec: o.restSec ?? 90,
    notes: { en, ar },
    videoId: null,
    videoUrl: null,
    ...o,
  };
}

const HEAVY = { workingSets: 4, repRange: '4–6', rir: '2', restSec: 180 } as const;
const STRENGTH = { workingSets: 4, repRange: '5', rir: '1', restSec: 180 } as const;
const ISO = { workingSets: 3, repRange: '12–15', restSec: 60 } as const;

export const STARTER_EXERCISES: Exercise[] = [
  // ---- Chest ----
  ex('barbell-bench-press', 'Barbell Bench Press', 'Chest', 'Chest', 'Barbell', 'Lower the bar to mid-chest, elbows ~45°, and press up without bouncing.', 'أنزل البار إلى منتصف الصدر مع زاوية مرفقين ٤٥° وادفع لأعلى دون ارتداد.', HEAVY),
  ex('incline-db-press', 'Incline Dumbbell Press', 'Upper chest', 'Chest', 'Dumbbell', 'Set the bench to 30°, press the dumbbells up and slightly together.', 'اضبط المقعد على ٣٠° وادفع الدمبلز لأعلى مع تقاربها قليلًا.'),
  ex('flat-db-press', 'Flat Dumbbell Press', 'Chest', 'Chest', 'Dumbbell', 'Press dumbbells from chest level with a controlled stretch at the bottom.', 'ادفع الدمبلز من مستوى الصدر مع تمدّد متحكّم في الأسفل.'),
  ex('machine-chest-press', 'Machine Chest Press', 'Chest', 'Chest', 'Machine', 'Keep shoulders down and press the handles forward smoothly.', 'أبقِ الكتفين للأسفل وادفع المقابض للأمام بسلاسة.'),
  ex('cable-fly', 'Cable Fly', 'Chest', 'Chest', 'Cable', 'Hug the cables together in an arc, squeezing the chest at the centre.', 'اجمع الكابلات في قوس مع عصر الصدر في المنتصف.', ISO),
  ex('pec-deck', 'Pec Deck', 'Chest', 'Chest', 'Machine', 'Bring the pads together with the chest, pause, and control the return.', 'اجمع الوسائد بالصدر، توقّف، وتحكّم في العودة.', ISO),
  ex('push-up', 'Push-Up', 'Chest', 'Chest', 'Bodyweight', 'Keep a straight line head-to-heel and lower until elbows reach 90°.', 'حافظ على خط مستقيم من الرأس للكعب وانزل حتى ٩٠° بالمرفقين.', { repRange: '10–20' }),
  ex('dips-chest', 'Chest Dip', 'Lower chest', 'Chest', 'Bodyweight', 'Lean forward slightly and lower until you feel a chest stretch.', 'مِل للأمام قليلًا وانزل حتى تشعر بتمدّد الصدر.'),

  // ---- Back ----
  ex('deadlift', 'Conventional Deadlift', 'Back', 'Back', 'Barbell', 'Brace, keep the bar close, and drive through the floor with a flat back.', 'شدّ جذعك، أبقِ البار قريبًا، وادفع الأرض مع ظهر مستقيم.', STRENGTH),
  ex('pull-up', 'Pull-Up', 'Lats', 'Back', 'Bodyweight', 'Pull your chest to the bar leading with the elbows; control the descent.', 'اسحب صدرك نحو البار بقيادة المرفقين وتحكّم في النزول.', { repRange: '6–12' }),
  ex('lat-pulldown', 'Lat Pulldown', 'Lats', 'Back', 'Cable', 'Pull the bar to your upper chest, driving elbows down and back.', 'اسحب البار إلى أعلى الصدر مع دفع المرفقين لأسفل وللخلف.'),
  ex('barbell-row', 'Barbell Row', 'Back', 'Back', 'Barbell', 'Hinge ~45°, row the bar to your lower ribs, squeeze the shoulder blades.', 'انحنِ ٤٥° واسحب البار إلى أسفل الأضلاع مع عصر لوحي الكتف.', { workingSets: 4 }),
  ex('seated-cable-row', 'Seated Cable Row', 'Back', 'Back', 'Cable', 'Keep the torso upright and pull to the navel, leading with the elbows.', 'أبقِ الجذع مستقيمًا واسحب إلى السرّة بقيادة المرفقين.'),
  ex('one-arm-db-row', 'One-Arm Dumbbell Row', 'Back', 'Back', 'Dumbbell', 'Brace on a bench and row the dumbbell to your hip in a long arc.', 'استند على المقعد واسحب الدمبل إلى الورك في قوس طويل.'),
  ex('chest-supported-row', 'Chest-Supported Row', 'Mid back', 'Back', 'Machine', 'Let the chest pad take your weight and row with strict form.', 'دع وسادة الصدر تحمل وزنك واسحب بأداء منضبط.'),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'Lats', 'Back', 'Cable', 'Keep arms long and pull the bar to your thighs using the lats.', 'أبقِ الذراعين ممدودتين واسحب البار إلى الفخذين باستخدام الظهر.', ISO),
  ex('back-extension', 'Back Extension', 'Lower back', 'Back', 'Bodyweight', 'Hinge at the hips and rise to a straight line — never hyperextend.', 'انحنِ من الورك وارتفع إلى خط مستقيم دون مبالغة في التقوّس.', ISO),

  // ---- Shoulders ----
  ex('overhead-press', 'Overhead Press', 'Shoulders', 'Shoulders', 'Barbell', 'Brace the core and press the bar overhead, finishing with biceps by ears.', 'شدّ البطن وادفع البار فوق الرأس منتهيًا بالذراعين بجوار الأذنين.', { workingSets: 4, repRange: '6–8' }),
  ex('db-shoulder-press', 'Dumbbell Shoulder Press', 'Shoulders', 'Shoulders', 'Dumbbell', 'Press dumbbells overhead without flaring excessively; control down.', 'ادفع الدمبلز فوق الرأس دون تباعد مفرط وتحكّم في النزول.'),
  ex('lateral-raise', 'Lateral Raise', 'Side delts', 'Shoulders', 'Dumbbell', 'Raise to shoulder height leading with the elbows, no swinging.', 'ارفع حتى مستوى الكتف بقيادة المرفقين دون تأرجح.', ISO),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'Side delts', 'Shoulders', 'Cable', 'Keep constant tension; raise the cable across and up to the side.', 'حافظ على شدّ ثابت وارفع الكابل للجانب لأعلى.', ISO),
  ex('rear-delt-fly', 'Rear Delt Fly', 'Rear delts', 'Shoulders', 'Dumbbell', 'Hinge over and raise the dumbbells out wide, pinkies leading.', 'انحنِ للأمام وارفع الدمبلز للجانبين مع تقدّم الخنصر.', ISO),
  ex('face-pull', 'Face Pull', 'Rear delts', 'Shoulders', 'Cable', 'Pull the rope to your forehead, externally rotating at the end.', 'اسحب الحبل نحو الجبهة مع تدوير خارجي في النهاية.', ISO),
  ex('arnold-press', 'Arnold Press', 'Shoulders', 'Shoulders', 'Dumbbell', 'Rotate the palms from facing you to forward as you press up.', 'دوّر راحتيك من مواجهتك إلى الأمام أثناء الدفع لأعلى.'),
  ex('upright-row', 'Upright Row', 'Shoulders', 'Shoulders', 'Cable', 'Pull the bar up the body to chest height, elbows leading.', 'اسحب البار لأعلى الجسم حتى الصدر بقيادة المرفقين.', ISO),

  // ---- Biceps ----
  ex('barbell-curl', 'Barbell Curl', 'Biceps', 'Biceps', 'Barbell', 'Keep elbows pinned and curl without swinging the torso.', 'ثبّت المرفقين ولفّ دون تأرجح الجذع.', ISO),
  ex('db-curl', 'Dumbbell Curl', 'Biceps', 'Biceps', 'Dumbbell', 'Curl with a slight supination, squeezing at the top.', 'لفّ مع دوران بسيط للراحة وعصر في الأعلى.', ISO),
  ex('hammer-curl', 'Hammer Curl', 'Brachialis', 'Biceps', 'Dumbbell', 'Keep a neutral grip throughout and control the lowering.', 'حافظ على قبضة محايدة طوال الحركة وتحكّم في النزول.', ISO),
  ex('incline-db-curl', 'Incline Dumbbell Curl', 'Biceps', 'Biceps', 'Dumbbell', 'Let the arms hang back on an incline for a deep stretch, then curl.', 'دع الذراعين تتدلّيان على مقعد مائل لتمدّد عميق ثم لفّ.', ISO),
  ex('cable-curl', 'Cable Curl', 'Biceps', 'Biceps', 'Cable', 'Use constant cable tension and a full squeeze each rep.', 'استخدم شدّ الكابل الثابت وعصرًا كاملًا كل تكرار.', ISO),
  ex('preacher-curl', 'Preacher Curl', 'Biceps', 'Biceps', 'Machine', 'Keep the upper arms flat on the pad and avoid bouncing out of the bottom.', 'أبقِ العضدين على الوسادة وتجنّب الارتداد من الأسفل.', ISO),

  // ---- Triceps ----
  ex('close-grip-bench', 'Close-Grip Bench Press', 'Triceps', 'Triceps', 'Barbell', 'Hands shoulder-width, tuck elbows, and press focusing on the triceps.', 'اليدان بعرض الكتفين، اضمم المرفقين وادفع مركزًا على الترايسبس.', { workingSets: 3, repRange: '6–10' }),
  ex('triceps-pushdown', 'Triceps Pushdown', 'Triceps', 'Triceps', 'Cable', 'Pin elbows to your sides and extend fully, squeezing at the bottom.', 'ثبّت المرفقين بجانبك ومدّ بالكامل مع عصر في الأسفل.', ISO),
  ex('overhead-triceps-ext', 'Overhead Triceps Extension', 'Triceps', 'Triceps', 'Cable', 'Keep elbows high and extend overhead for a long-head stretch.', 'أبقِ المرفقين مرتفعين ومدّ فوق الرأس لتمدّد الرأس الطويل.', ISO),
  ex('skullcrusher', 'Skullcrusher', 'Triceps', 'Triceps', 'Barbell', 'Lower the bar to your forehead with elbows steady, then extend.', 'أنزل البار نحو الجبهة مع ثبات المرفقين ثم مدّ.', ISO),
  ex('dips-triceps', 'Triceps Dip', 'Triceps', 'Triceps', 'Bodyweight', 'Stay upright and lower until elbows reach 90° to target triceps.', 'ابقَ مستقيمًا وانزل حتى ٩٠° لاستهداف الترايسبس.'),
  ex('rope-kickback', 'Triceps Kickback', 'Triceps', 'Triceps', 'Dumbbell', 'Hinge over, keep the upper arm still, and extend behind you.', 'انحنِ، ثبّت العضد، ومدّ للخلف.', ISO),

  // ---- Quads ----
  ex('back-squat', 'Back Squat', 'Quads', 'Quads', 'Barbell', 'Brace, sit down between the hips, and drive up keeping the chest tall.', 'شدّ جذعك، انزل بين الوركين، وادفع لأعلى مع صدر مرفوع.', STRENGTH),
  ex('front-squat', 'Front Squat', 'Quads', 'Quads', 'Barbell', 'Keep elbows high and torso upright as you squat deep.', 'أبقِ المرفقين مرتفعين والجذع مستقيمًا أثناء النزول العميق.', { workingSets: 4, repRange: '5–8' }),
  ex('leg-press', 'Leg Press', 'Quads', 'Quads', 'Machine', 'Lower under control to ~90° and press without locking the knees hard.', 'أنزل بتحكّم حتى ٩٠° وادفع دون قفل الركبتين بقوة.', { workingSets: 4 }),
  ex('hack-squat', 'Hack Squat', 'Quads', 'Quads', 'Machine', 'Keep your whole back on the pad and descend to depth.', 'أبقِ ظهرك كاملًا على الوسادة وانزل للعمق.', { workingSets: 4 }),
  ex('leg-extension', 'Leg Extension', 'Quads', 'Quads', 'Machine', 'Extend fully and squeeze the quads, lowering slowly.', 'مدّ بالكامل واعصر الفخذ مع نزول بطيء.', ISO),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'Quads', 'Quads', 'Dumbbell', 'Rear foot elevated, drop straight down through the front heel.', 'القدم الخلفية مرفوعة، انزل مباشرة عبر كعب القدم الأمامية.', { repRange: '8–12' }),
  ex('walking-lunge', 'Walking Lunge', 'Quads', 'Quads', 'Dumbbell', 'Step into a lunge and drive through the front heel each step.', 'اخطُ في اندفاع وادفع عبر الكعب الأمامي كل خطوة.', { repRange: '10–12' }),

  // ---- Hamstrings / Glutes ----
  ex('romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'Hamstrings', 'Barbell', 'Push hips back with soft knees, feel the stretch, then drive forward.', 'ادفع الورك للخلف مع ركبتين ليّنتين، اشعر بالتمدّد ثم تقدّم.', { workingSets: 4, repRange: '8–10' }),
  ex('lying-leg-curl', 'Lying Leg Curl', 'Hamstrings', 'Hamstrings', 'Machine', 'Curl the heels to your glutes and control the lowering.', 'لفّ الكعبين نحو الأرداف وتحكّم في النزول.', ISO),
  ex('seated-leg-curl', 'Seated Leg Curl', 'Hamstrings', 'Hamstrings', 'Machine', 'Keep hips down and curl hard, pausing at peak contraction.', 'أبقِ الورك ثابتًا ولفّ بقوة مع توقّف عند الانقباض.', ISO),
  ex('hip-thrust', 'Hip Thrust', 'Glutes', 'Glutes', 'Barbell', 'Drive through the heels and squeeze the glutes at lockout.', 'ادفع عبر الكعبين واعصر الأرداف عند القمة.', { workingSets: 4, repRange: '8–12' }),
  ex('glute-bridge', 'Glute Bridge', 'Glutes', 'Glutes', 'Bodyweight', 'Posterior tilt and squeeze the glutes hard at the top.', 'أمِل الحوض واعصر الأرداف بقوة في الأعلى.', ISO),
  ex('cable-pull-through', 'Cable Pull-Through', 'Glutes', 'Glutes', 'Cable', 'Hinge at the hips and snap forward squeezing the glutes.', 'انحنِ من الورك واندفع للأمام بعصر الأرداف.', ISO),
  ex('hip-abduction', 'Hip Abduction', 'Glutes', 'Glutes', 'Machine', 'Push the pads outward and pause on the squeeze.', 'ادفع الوسائد للخارج وتوقّف عند العصر.', ISO),

  // ---- Calves / Core ----
  ex('standing-calf-raise', 'Standing Calf Raise', 'Calves', 'Calves', 'Machine', 'Rise to full plantarflexion and stretch deep at the bottom.', 'ارتفع بالكامل على المشط وتمدّد عميقًا في الأسفل.', { workingSets: 4, repRange: '10–15', restSec: 60 }),
  ex('seated-calf-raise', 'Seated Calf Raise', 'Calves', 'Calves', 'Machine', 'Slow tempo with a full stretch and squeeze each rep.', 'إيقاع بطيء مع تمدّد كامل وعصر كل تكرار.', ISO),
  ex('plank', 'Plank', 'Core', 'Core', 'Bodyweight', 'Brace the abs and glutes; hold a straight line without sagging.', 'شدّ البطن والأرداف واحفظ خطًا مستقيمًا دون تدلٍّ.', { workingSets: 3, repRange: '30–60s', restSec: 45, tempo: 'hold' }),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'Abs', 'Core', 'Bodyweight', 'Raise the legs with control, avoiding swing.', 'ارفع الساقين بتحكّم وتجنّب التأرجح.', ISO),
  ex('cable-crunch', 'Cable Crunch', 'Abs', 'Core', 'Cable', 'Crunch down with the abs, keeping the hips fixed.', 'انثنِ لأسفل بالبطن مع تثبيت الورك.', ISO),
  ex('russian-twist', 'Russian Twist', 'Obliques', 'Core', 'Bodyweight', 'Rotate side to side under control, bracing the core.', 'دوّر جانبًا لجانب بتحكّم مع شدّ البطن.', { repRange: '20', restSec: 45 }),
  ex('ab-wheel', 'Ab Wheel Rollout', 'Core', 'Core', 'Bodyweight', 'Roll out only as far as you can keep a braced, neutral spine.', 'تدحرج للأمام بقدر ما تحافظ على عمود فقري محايد ومشدود.', ISO),

  // ---- Cardio ----
  ex('treadmill-incline-walk', 'Incline Treadmill Walk', 'Cardio', 'Cardio', 'Machine', 'Brisk walk at 8–12% incline; keep a conversational pace.', 'مشي سريع على ميل ٨–١٢٪ بوتيرة تسمح بالحديث.', { workingSets: 1, repRange: '20–40 min', restSec: 0, tempo: 'steady' }),
  ex('stationary-bike', 'Stationary Bike', 'Cardio', 'Cardio', 'Machine', 'Steady moderate effort; raise resistance to keep the heart rate up.', 'مجهود معتدل ثابت مع رفع المقاومة لإبقاء النبض مرتفعًا.', { workingSets: 1, repRange: '20–40 min', restSec: 0, tempo: 'steady' }),
  ex('rowing-machine', 'Rowing Machine', 'Cardio', 'Cardio', 'Machine', 'Drive with the legs, then back, then arms; reverse on the return.', 'ادفع بالساقين ثم الظهر ثم الذراعين واعكس في العودة.', { workingSets: 1, repRange: '10–20 min', restSec: 0, tempo: 'steady' }),
  ex('jump-rope', 'Jump Rope', 'Cardio', 'Cardio', 'Bodyweight', 'Light bounces on the balls of the feet, wrists turning the rope.', 'قفزات خفيفة على مشط القدم مع تدوير الحبل بالمعصمين.', { workingSets: 4, repRange: '60s', restSec: 45, tempo: 'fast' }),
  ex('hiit-intervals', 'HIIT Intervals', 'Cardio', 'Cardio', 'Machine', 'Alternate hard 30s efforts with 60–90s easy recovery.', 'بدّل بين مجهود قوي ٣٠ث وراحة سهلة ٦٠–٩٠ث.', { workingSets: 6, repRange: '30s', restSec: 75, tempo: 'fast' }),
  ex('stair-climber', 'Stair Climber', 'Cardio', 'Cardio', 'Machine', 'Steady climb, full steps, upright posture without leaning on rails.', 'صعود ثابت بخطوات كاملة ووقفة مستقيمة دون اتكاء.', { workingSets: 1, repRange: '15–25 min', restSec: 0, tempo: 'steady' }),

  // ---- Mobility / Stretching ----
  ex('cat-cow', 'Cat-Cow', 'Spine', 'Mobility', 'Bodyweight', 'Alternate arching and rounding the spine slowly with the breath.', 'بدّل بين تقوّس وتدوير العمود الفقري ببطء مع النفَس.', { workingSets: 2, repRange: '10', restSec: 30, tempo: 'slow' }),
  ex('worlds-greatest-stretch', "World's Greatest Stretch", 'Full body', 'Mobility', 'Bodyweight', 'Lunge, rotate the torso open, then flow to the next side.', 'اندفع، افتح الجذع بالدوران، ثم انتقل للجانب الآخر.', { workingSets: 2, repRange: '6/side', restSec: 30, tempo: 'slow' }),
  ex('hip-flexor-stretch', 'Hip Flexor Stretch', 'Hip flexors', 'Stretching', 'Bodyweight', 'Half-kneel and gently push the hips forward, glute squeezed.', 'اركع نصفيًا وادفع الورك للأمام بلطف مع عصر الأرداف.', { workingSets: 2, repRange: '30s/side', restSec: 20, tempo: 'hold' }),
  ex('hamstring-stretch', 'Hamstring Stretch', 'Hamstrings', 'Stretching', 'Bodyweight', 'Hinge over a long leg with a flat back until you feel a stretch.', 'انحنِ فوق ساق ممدودة مع ظهر مستقيم حتى تشعر بالتمدّد.', { workingSets: 2, repRange: '30s/side', restSec: 20, tempo: 'hold' }),
  ex('thoracic-rotation', 'Thoracic Rotation', 'Upper back', 'Mobility', 'Bodyweight', 'On all fours, reach one arm to the ceiling and follow with the eyes.', 'على الأربع، مدّ ذراعًا للسقف وتابعها بعينيك.', { workingSets: 2, repRange: '8/side', restSec: 20, tempo: 'slow' }),
  ex('shoulder-dislocates', 'Band Shoulder Dislocates', 'Shoulders', 'Mobility', 'Resistance Band', 'Take a band overhead and behind with straight arms to open the shoulders.', 'مرّر شريطًا فوق الرأس وللخلف بذراعين مستقيمتين لفتح الكتفين.', { workingSets: 2, repRange: '10', restSec: 20, tempo: 'slow' }),

  // ---- Resistance band / extras ----
  ex('band-pull-apart', 'Band Pull-Apart', 'Rear delts', 'Shoulders', 'Resistance Band', 'Pull the band apart to your chest, squeezing the upper back.', 'افتح الشريط نحو الصدر مع عصر أعلى الظهر.', { workingSets: 3, repRange: '15–20', restSec: 45 }),
  ex('band-row', 'Band Row', 'Back', 'Back', 'Resistance Band', 'Anchor the band and row to your ribs with control.', 'ثبّت الشريط واسحب إلى الأضلاع بتحكّم.', ISO),
  ex('goblet-squat', 'Goblet Squat', 'Quads', 'Quads', 'Dumbbell', 'Hold a dumbbell at the chest and squat between the hips.', 'احمل دمبل عند الصدر وانزل بين الوركين.', { repRange: '10–15' }),
  ex('smith-squat', 'Smith Machine Squat', 'Quads', 'Quads', 'Smith Machine', 'Place feet slightly forward and squat under control on the fixed bar.', 'ضع القدمين للأمام قليلًا وانزل بتحكّم على البار الثابت.', { workingSets: 4 }),
  ex('smith-incline-press', 'Smith Incline Press', 'Upper chest', 'Chest', 'Smith Machine', 'Press the fixed bar from the upper chest on a 30° bench.', 'ادفع البار الثابت من أعلى الصدر على مقعد ٣٠°.'),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'Shoulders', 'Shoulders', 'Machine', 'Press the handles overhead, keeping the lower back on the pad.', 'ادفع المقابض فوق الرأس مع إبقاء أسفل الظهر على الوسادة.'),
  ex('machine-row', 'Machine Row', 'Back', 'Back', 'Machine', 'Row the handles to your torso and squeeze the shoulder blades.', 'اسحب المقابض إلى الجذع واعصر لوحي الكتف.'),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'Rear delts', 'Shoulders', 'Machine', 'Open the arms wide against the pads, squeezing the rear delts.', 'افتح الذراعين على الوسائد مع عصر الكتف الخلفي.', ISO),
  ex('cable-crossover-low', 'Low Cable Crossover', 'Upper chest', 'Chest', 'Cable', 'Drive the cables up and together to target the upper chest.', 'ادفع الكابلات لأعلى وللتجميع لاستهداف أعلى الصدر.', ISO),
  ex('zercher-carry', 'Farmer Carry', 'Core', 'Core', 'Dumbbell', 'Walk tall with heavy dumbbells, ribs down and core braced.', 'امشِ منتصبًا بدمبلز ثقيلة مع شدّ البطن.', { workingSets: 3, repRange: '30–40m', restSec: 60, tempo: 'carry' }),

  // ---- More chest / back / shoulders ----
  ex('incline-machine-press', 'Incline Machine Press', 'Upper chest', 'Chest', 'Machine', 'Press the handles up and in from the upper-chest position.', 'ادفع المقابض لأعلى وللداخل من وضع أعلى الصدر.'),
  ex('decline-bench-press', 'Decline Bench Press', 'Lower chest', 'Chest', 'Barbell', 'Press from a decline to bias the lower chest; control the descent.', 'ادفع من مقعد منحدر لاستهداف أسفل الصدر مع نزول متحكّم.', { workingSets: 3, repRange: '6–10' }),
  ex('t-bar-row', 'T-Bar Row', 'Back', 'Back', 'Barbell', 'Hinge over the bar and row to the chest, squeezing the mid-back.', 'انحنِ فوق البار واسحب نحو الصدر مع عصر وسط الظهر.', { workingSets: 4 }),
  ex('pendlay-row', 'Pendlay Row', 'Back', 'Back', 'Barbell', 'Row explosively from a dead stop on the floor each rep.', 'اسحب بقوة من توقف تام على الأرض كل تكرار.', { workingSets: 4, repRange: '5–8' }),
  ex('meadows-row', 'Meadows Row', 'Back', 'Back', 'Barbell', 'Row a landmine bar one-armed with a strong lat stretch.', 'اسحب بار اللاندماين بذراع واحدة مع تمدّد قوي للظهر.'),
  ex('db-shrug', 'Dumbbell Shrug', 'Traps', 'Back', 'Dumbbell', 'Shrug straight up and pause; avoid rolling the shoulders.', 'ارفع الكتفين لأعلى مباشرة مع توقّف دون تدوير.', ISO),
  ex('barbell-shrug', 'Barbell Shrug', 'Traps', 'Back', 'Barbell', 'Elevate the shoulders to the ears, squeeze, and lower slowly.', 'ارفع الكتفين نحو الأذنين، اعصر، وأنزل ببطء.', ISO),
  ex('cable-rear-delt', 'Cable Rear Delt', 'Rear delts', 'Shoulders', 'Cable', 'Cross the cables and pull wide to hit the rear delts.', 'تقاطع الكابلات واسحب للجانبين لاستهداف الكتف الخلفي.', ISO),

  // ---- More arms ----
  ex('ez-bar-curl', 'EZ-Bar Curl', 'Biceps', 'Biceps', 'Barbell', 'Curl on the EZ bar to spare the wrists; keep elbows still.', 'لفّ على بار EZ لراحة المعصمين مع ثبات المرفقين.', ISO),
  ex('concentration-curl', 'Concentration Curl', 'Biceps', 'Biceps', 'Dumbbell', 'Brace the elbow on the thigh and curl with a peak squeeze.', 'استند بالمرفق على الفخذ ولفّ مع عصر في القمة.', ISO),
  ex('spider-curl', 'Spider Curl', 'Biceps', 'Biceps', 'Dumbbell', 'Curl with arms hanging over an incline for constant tension.', 'لفّ والذراعان متدلّيتان فوق مقعد مائل لشدّ ثابت.', ISO),
  ex('diamond-pushup', 'Diamond Push-Up', 'Triceps', 'Triceps', 'Bodyweight', 'Hands together under the chest; lower with elbows tucked.', 'اليدان متلاصقتان تحت الصدر وانزل مع ضمّ المرفقين.', { repRange: '8–15' }),

  // ---- More legs / glutes / calves ----
  ex('sissy-squat', 'Sissy Squat', 'Quads', 'Quads', 'Bodyweight', 'Lean back on the toes to isolate the quads through the knee.', 'مِل للخلف على المشط لعزل الفخذ عبر الركبة.', ISO),
  ex('step-up', 'Step-Up', 'Quads', 'Quads', 'Dumbbell', 'Drive through the top foot to stand tall; control the way down.', 'ادفع عبر القدم العليا للوقوف وتحكّم في النزول.', { repRange: '10–12' }),
  ex('nordic-curl', 'Nordic Hamstring Curl', 'Hamstrings', 'Hamstrings', 'Bodyweight', 'Lower slowly under control, resisting with the hamstrings.', 'انزل ببطء بتحكّم مع مقاومة بالعضلة الخلفية.', { repRange: '5–8' }),
  ex('good-morning', 'Good Morning', 'Hamstrings', 'Hamstrings', 'Barbell', 'Hinge with a flat back and soft knees, then stand tall.', 'انحنِ بظهر مستقيم وركبتين ليّنتين ثم قف منتصبًا.', { repRange: '8–10' }),
  ex('single-leg-rdl', 'Single-Leg RDL', 'Hamstrings', 'Hamstrings', 'Dumbbell', 'Hinge on one leg keeping hips square; feel the hamstring.', 'انحنِ على ساق واحدة مع ثبات الورك واشعر بالعضلة الخلفية.', { repRange: '8–10' }),
  ex('glute-kickback', 'Cable Glute Kickback', 'Glutes', 'Glutes', 'Cable', 'Kick the leg back and up, squeezing the glute at the top.', 'ادفع الساق للخلف ولأعلى مع عصر الأرداف في القمة.', ISO),
  ex('donkey-calf-raise', 'Donkey Calf Raise', 'Calves', 'Calves', 'Machine', 'Hinge at the hips and raise the heels through a full range.', 'انحنِ من الورك وارفع الكعبين عبر مدى كامل.', ISO),

  // ---- More core / conditioning ----
  ex('decline-situp', 'Decline Sit-Up', 'Abs', 'Core', 'Bodyweight', 'Curl up on a decline under control; avoid yanking the neck.', 'انثنِ لأعلى على مقعد منحدر بتحكّم دون شدّ الرقبة.', { repRange: '12–20', restSec: 45 }),
  ex('side-plank', 'Side Plank', 'Obliques', 'Core', 'Bodyweight', 'Stack the hips and hold a straight line on the forearm.', 'اصفُف الوركين واحفظ خطًا مستقيمًا على الساعد.', { workingSets: 3, repRange: '30–45s/side', restSec: 30, tempo: 'hold' }),
  ex('mountain-climber', 'Mountain Climber', 'Core', 'Cardio', 'Bodyweight', 'Drive the knees in fast while holding a strong plank.', 'ادفع الركبتين للداخل بسرعة مع ثبات وضع البلانك.', { workingSets: 4, repRange: '30s', restSec: 45, tempo: 'fast' }),
  ex('burpee', 'Burpee', 'Full body', 'Cardio', 'Bodyweight', 'Squat, kick back to a push-up, return and jump explosively.', 'اقرفص، اركل للخلف لتمرين ضغط، ثم عُد واقفز بقوة.', { workingSets: 4, repRange: '10–15', restSec: 60, tempo: 'fast' }),
  ex('battle-ropes', 'Battle Ropes', 'Cardio', 'Cardio', 'Machine', 'Alternate powerful waves keeping the core braced.', 'بدّل موجات قوية مع شدّ البطن.', { workingSets: 4, repRange: '30s', restSec: 60, tempo: 'fast' }),
];

// ---- Foods -----------------------------------------------------------------

function fd(slug: string, en: string, ar: string, quantity: string, calories: number, protein: number, carbs: number, fats: number, category: string): LibraryFood {
  return { id: `seed-food-${slug}`, name: { en, ar }, quantity, calories, protein, carbs, fats, category };
}

export const STARTER_FOODS: LibraryFood[] = [
  // Protein
  fd('chicken-breast', 'Chicken Breast (cooked)', 'صدر دجاج (مطبوخ)', '100 g', 165, 31, 0, 3.6, 'Protein'),
  fd('lean-beef', 'Lean Beef (cooked)', 'لحم بقري قليل الدهن (مطبوخ)', '100 g', 217, 26, 0, 12, 'Protein'),
  fd('salmon', 'Salmon (cooked)', 'سلمون (مطبوخ)', '100 g', 206, 22, 0, 13, 'Protein'),
  fd('tuna-can', 'Canned Tuna (in water)', 'تونة معلّبة (بالماء)', '100 g', 116, 26, 0, 1, 'Protein'),
  fd('whole-egg', 'Whole Egg', 'بيضة كاملة', '1 large (50 g)', 78, 6, 0.6, 5, 'Protein'),
  fd('egg-white', 'Egg White', 'بياض بيض', '100 g', 52, 11, 0.7, 0.2, 'Protein'),
  fd('greek-yogurt', 'Greek Yogurt (0%)', 'زبادي يوناني (٠٪)', '100 g', 59, 10, 3.6, 0.4, 'Protein'),
  fd('cottage-cheese', 'Cottage Cheese (low-fat)', 'جبن قريش قليل الدسم', '100 g', 98, 11, 3.4, 4.3, 'Protein'),
  fd('whey', 'Whey Protein', 'بروتين واي', '1 scoop (30 g)', 120, 24, 3, 1.5, 'Protein'),
  fd('shrimp', 'Shrimp (cooked)', 'جمبري (مطبوخ)', '100 g', 99, 24, 0.2, 0.3, 'Protein'),
  fd('turkey-breast', 'Turkey Breast', 'صدر ديك رومي', '100 g', 135, 30, 0, 1, 'Protein'),
  fd('tofu', 'Tofu (firm)', 'توفو (صلب)', '100 g', 144, 17, 3, 9, 'Protein'),
  fd('tilapia', 'Tilapia (cooked)', 'بلطي (مطبوخ)', '100 g', 128, 26, 0, 3, 'Protein'),

  // Carbs
  fd('white-rice', 'White Rice (cooked)', 'أرز أبيض (مطبوخ)', '100 g', 130, 2.7, 28, 0.3, 'Carbs'),
  fd('brown-rice', 'Brown Rice (cooked)', 'أرز بني (مطبوخ)', '100 g', 112, 2.6, 24, 0.9, 'Carbs'),
  fd('potato', 'Potato (boiled)', 'بطاطس (مسلوقة)', '100 g', 87, 1.9, 20, 0.1, 'Carbs'),
  fd('sweet-potato', 'Sweet Potato (baked)', 'بطاطا حلوة (مشوية)', '100 g', 90, 2, 21, 0.1, 'Carbs'),
  fd('oats', 'Rolled Oats (dry)', 'شوفان (جاف)', '40 g', 152, 5, 27, 2.5, 'Carbs'),
  fd('pasta', 'Pasta (cooked)', 'مكرونة (مطبوخة)', '100 g', 131, 5, 25, 1.1, 'Carbs'),
  fd('whole-wheat-bread', 'Whole-Wheat Bread', 'خبز قمح كامل', '1 slice (40 g)', 100, 4, 18, 1.5, 'Carbs'),
  fd('baladi-bread', 'Baladi Bread', 'عيش بلدي', '1 loaf (90 g)', 250, 9, 50, 1.5, 'Carbs'),
  fd('quinoa', 'Quinoa (cooked)', 'كينوا (مطبوخة)', '100 g', 120, 4.4, 21, 1.9, 'Carbs'),
  fd('cornflakes', 'Corn Flakes', 'رقائق الذرة', '30 g', 113, 2, 25, 0.3, 'Carbs'),
  fd('couscous', 'Couscous (cooked)', 'كسكسي (مطبوخ)', '100 g', 112, 3.8, 23, 0.2, 'Carbs'),
  fd('macaroni-bechamel', 'Macaroni (plain, cooked)', 'مكرونة سادة (مطبوخة)', '100 g', 131, 5, 25, 1.1, 'Carbs'),

  // Healthy fats
  fd('olive-oil', 'Olive Oil', 'زيت زيتون', '1 tbsp (14 g)', 119, 0, 0, 14, 'Healthy fats'),
  fd('almonds', 'Almonds', 'لوز', '28 g', 164, 6, 6, 14, 'Healthy fats'),
  fd('peanut-butter', 'Peanut Butter', 'زبدة فول سوداني', '1 tbsp (16 g)', 94, 4, 3, 8, 'Healthy fats'),
  fd('avocado', 'Avocado', 'أفوكادو', '100 g', 160, 2, 9, 15, 'Healthy fats'),
  fd('walnuts', 'Walnuts', 'عين جمل', '28 g', 185, 4, 4, 18, 'Healthy fats'),
  fd('chia-seeds', 'Chia Seeds', 'بذور الشيا', '15 g', 73, 2.5, 6, 4.6, 'Healthy fats'),
  fd('tahini', 'Tahini', 'طحينة', '1 tbsp (15 g)', 89, 2.6, 3, 8, 'Healthy fats'),
  fd('cheese-cheddar', 'Cheddar Cheese', 'جبن شيدر', '30 g', 120, 7, 0.4, 10, 'Healthy fats'),

  // Vegetables
  fd('broccoli', 'Broccoli', 'بروكلي', '100 g', 34, 2.8, 7, 0.4, 'Vegetables'),
  fd('spinach', 'Spinach', 'سبانخ', '100 g', 23, 2.9, 3.6, 0.4, 'Vegetables'),
  fd('cucumber', 'Cucumber', 'خيار', '100 g', 15, 0.7, 3.6, 0.1, 'Vegetables'),
  fd('tomato', 'Tomato', 'طماطم', '100 g', 18, 0.9, 3.9, 0.2, 'Vegetables'),
  fd('green-salad', 'Mixed Green Salad', 'سلطة خضراء', '150 g', 30, 2, 6, 0.3, 'Vegetables'),
  fd('bell-pepper', 'Bell Pepper', 'فلفل ألوان', '100 g', 31, 1, 6, 0.3, 'Vegetables'),
  fd('carrot', 'Carrot', 'جزر', '100 g', 41, 0.9, 10, 0.2, 'Vegetables'),
  fd('green-beans', 'Green Beans', 'فاصوليا خضراء', '100 g', 31, 1.8, 7, 0.2, 'Vegetables'),
  fd('zucchini', 'Zucchini', 'كوسة', '100 g', 17, 1.2, 3.1, 0.3, 'Vegetables'),

  // Fruits
  fd('banana', 'Banana', 'موز', '1 medium (118 g)', 105, 1.3, 27, 0.4, 'Fruits'),
  fd('apple', 'Apple', 'تفاح', '1 medium (182 g)', 95, 0.5, 25, 0.3, 'Fruits'),
  fd('orange', 'Orange', 'برتقال', '1 medium (131 g)', 62, 1.2, 15, 0.2, 'Fruits'),
  fd('strawberries', 'Strawberries', 'فراولة', '100 g', 32, 0.7, 7.7, 0.3, 'Fruits'),
  fd('dates', 'Dates', 'تمر', '2 pieces (24 g)', 67, 0.4, 18, 0.1, 'Fruits'),
  fd('grapes', 'Grapes', 'عنب', '100 g', 69, 0.7, 18, 0.2, 'Fruits'),
  fd('watermelon', 'Watermelon', 'بطيخ', '150 g', 45, 0.9, 11, 0.2, 'Fruits'),
  fd('blueberries', 'Blueberries', 'توت أزرق', '100 g', 57, 0.7, 14, 0.3, 'Fruits'),
  fd('mango', 'Mango', 'مانجو', '100 g', 60, 0.8, 15, 0.4, 'Fruits'),

  // Breakfast
  fd('full-fava', 'Foul Medames', 'فول مدمس', '150 g', 165, 11, 22, 4, 'Breakfast'),
  fd('falafel', 'Falafel (2 pcs)', 'طعمية (٢ قطعة)', '60 g', 200, 7, 18, 11, 'Breakfast'),
  fd('labneh', 'Labneh', 'لبنة', '50 g', 80, 4, 3, 6, 'Breakfast'),
  fd('feta', 'Feta / White Cheese', 'جبن أبيض', '30 g', 80, 4, 1, 6, 'Breakfast'),
  fd('pancakes', 'Protein Pancakes', 'بان كيك بروتين', '2 (120 g)', 230, 18, 25, 6, 'Breakfast'),
  fd('honey', 'Honey', 'عسل', '1 tbsp (21 g)', 64, 0.1, 17, 0, 'Breakfast'),

  // Snacks
  fd('rice-cake', 'Rice Cake', 'كيك أرز', '2 (18 g)', 70, 1.5, 15, 0.5, 'Snacks'),
  fd('protein-bar', 'Protein Bar', 'لوح بروتين', '1 (60 g)', 220, 20, 22, 7, 'Snacks'),
  fd('popcorn', 'Air-Popped Popcorn', 'فشار (هواء)', '20 g', 78, 2.5, 16, 0.9, 'Snacks'),
  fd('mixed-nuts', 'Mixed Nuts', 'مكسرات مشكّلة', '28 g', 173, 5, 6, 15, 'Snacks'),
  fd('dark-chocolate', 'Dark Chocolate (85%)', 'شوكولاتة داكنة ٨٥٪', '20 g', 120, 2, 6, 10, 'Snacks'),
  fd('hummus', 'Hummus', 'حمص بطحينة', '50 g', 88, 3, 8, 5, 'Snacks'),

  // Drinks
  fd('skim-milk', 'Skim Milk', 'لبن خالي الدسم', '250 ml', 83, 8, 12, 0.2, 'Drinks'),
  fd('whole-milk', 'Whole Milk', 'لبن كامل الدسم', '250 ml', 149, 8, 12, 8, 'Drinks'),
  fd('orange-juice', 'Orange Juice', 'عصير برتقال', '250 ml', 112, 2, 26, 0.5, 'Drinks'),
  fd('black-coffee', 'Black Coffee', 'قهوة سادة', '1 cup', 2, 0.3, 0, 0, 'Drinks'),
  fd('green-tea', 'Green Tea', 'شاي أخضر', '1 cup', 0, 0, 0, 0, 'Drinks'),

  // Supplements
  fd('creatine', 'Creatine Monohydrate', 'كرياتين مونوهيدرات', '5 g', 0, 0, 0, 0, 'Supplements'),
  fd('omega3', 'Omega-3 Fish Oil', 'أوميغا-٣ زيت سمك', '1 g', 9, 0, 0, 1, 'Supplements'),
  fd('multivitamin', 'Multivitamin', 'فيتامينات متعددة', '1 tablet', 0, 0, 0, 0, 'Supplements'),
  fd('vitamin-d', 'Vitamin D3', 'فيتامين د٣', '1 capsule', 0, 0, 0, 0, 'Supplements'),
  fd('electrolytes', 'Electrolyte Mix', 'مزيج إلكتروليت', '1 serving', 10, 0, 2, 0, 'Supplements'),

  // More protein
  fd('ground-turkey', 'Ground Turkey (lean, cooked)', 'لحم ديك رومي مفروم (مطبوخ)', '100 g', 170, 22, 0, 9, 'Protein'),
  fd('sardines', 'Sardines (canned)', 'سردين معلّب', '100 g', 208, 25, 0, 11, 'Protein'),
  fd('beef-liver', 'Beef Liver (cooked)', 'كبد بقري (مطبوخ)', '100 g', 175, 27, 5, 5, 'Protein'),
  // More carbs / legumes
  fd('chickpeas', 'Chickpeas (cooked)', 'حمص مسلوق', '100 g', 164, 9, 27, 2.6, 'Carbs'),
  fd('lentils', 'Lentils (cooked)', 'عدس (مطبوخ)', '100 g', 116, 9, 20, 0.4, 'Carbs'),
  fd('kidney-beans', 'Kidney Beans (cooked)', 'فاصوليا حمراء (مطبوخة)', '100 g', 127, 8.7, 23, 0.5, 'Carbs'),
  fd('corn', 'Corn', 'ذرة', '100 g', 96, 3.4, 21, 1.5, 'Carbs'),
  // More fats
  fd('pumpkin-seeds', 'Pumpkin Seeds', 'بذور اليقطين', '28 g', 151, 7, 5, 13, 'Healthy fats'),
  fd('cashews', 'Cashews', 'كاجو', '28 g', 157, 5, 9, 12, 'Healthy fats'),
  // More fruits
  fd('pineapple', 'Pineapple', 'أناناس', '100 g', 50, 0.5, 13, 0.1, 'Fruits'),
  fd('pomegranate', 'Pomegranate', 'رمان', '100 g', 83, 1.7, 19, 1.2, 'Fruits'),
];

// ---- Food groups (approved-alternative sets) -------------------------------

export interface StarterFoodGroup {
  id: string;
  name: string;
  notes?: string;
  foodIds: string[];
}

export const STARTER_FOOD_GROUPS: StarterFoodGroup[] = [
  { id: 'seed-fg-rice-alts', name: 'Rice alternatives', foodIds: ['white-rice', 'brown-rice', 'quinoa', 'couscous', 'pasta'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-bread-alts', name: 'Bread alternatives', foodIds: ['whole-wheat-bread', 'baladi-bread', 'rice-cake'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-breakfast-carbs', name: 'Breakfast carbs', foodIds: ['oats', 'cornflakes', 'pancakes', 'baladi-bread'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-protein-alts', name: 'Protein alternatives', foodIds: ['chicken-breast', 'lean-beef', 'tilapia', 'turkey-breast', 'tuna-can', 'tofu'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-snack-alts', name: 'Snack alternatives', foodIds: ['protein-bar', 'rice-cake', 'popcorn', 'hummus', 'dark-chocolate'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-healthy-fats', name: 'Healthy fats', foodIds: ['olive-oil', 'almonds', 'peanut-butter', 'avocado', 'walnuts', 'tahini'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-fruits', name: 'Fruits', foodIds: ['banana', 'apple', 'orange', 'strawberries', 'grapes', 'blueberries'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-vegetables', name: 'Vegetables', foodIds: ['broccoli', 'spinach', 'cucumber', 'tomato', 'bell-pepper', 'green-beans'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-pre-workout', name: 'Pre-workout options', foodIds: ['banana', 'dates', 'oats', 'black-coffee'].map((s) => `seed-food-${s}`) },
  { id: 'seed-fg-post-workout', name: 'Post-workout options', foodIds: ['whey', 'white-rice', 'banana', 'skim-milk'].map((s) => `seed-food-${s}`) },
];

// ---- Workout templates -----------------------------------------------------

export interface StarterTemplateDay {
  title: string;
  focus: string;
  exSlugs: string[];
}
export interface StarterTemplate {
  id: string;
  name: string;
  goal: WorkoutGoal;
  splitType: SplitType;
  days: StarterTemplateDay[];
}

const d = (title: string, focus: string, exSlugs: string[]): StarterTemplateDay => ({ title, focus, exSlugs });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'seed-wt-ppl', name: 'Push / Pull / Legs', goal: 'hypertrophy', splitType: 'ppl',
    days: [
      d('Push', 'Chest / Shoulders / Triceps', ['barbell-bench-press', 'incline-db-press', 'machine-shoulder-press', 'lateral-raise', 'triceps-pushdown', 'overhead-triceps-ext']),
      d('Pull', 'Back / Rear delts / Biceps', ['deadlift', 'lat-pulldown', 'seated-cable-row', 'face-pull', 'barbell-curl', 'hammer-curl']),
      d('Legs', 'Quads / Hams / Calves', ['back-squat', 'romanian-deadlift', 'leg-press', 'lying-leg-curl', 'standing-calf-raise', 'hanging-leg-raise']),
    ],
  },
  {
    id: 'seed-wt-upper-lower', name: 'Upper / Lower', goal: 'hypertrophy', splitType: 'upper_lower',
    days: [
      d('Upper', 'Chest / Back / Shoulders / Arms', ['barbell-bench-press', 'barbell-row', 'db-shoulder-press', 'lat-pulldown', 'db-curl', 'triceps-pushdown']),
      d('Lower', 'Quads / Hams / Glutes / Calves', ['back-squat', 'romanian-deadlift', 'leg-extension', 'seated-leg-curl', 'hip-thrust', 'standing-calf-raise']),
    ],
  },
  {
    id: 'seed-wt-fullbody-beginner', name: 'Full Body — Beginner', goal: 'beginner', splitType: 'full_body',
    days: [
      d('Full Body A', 'Whole body', ['goblet-squat', 'machine-chest-press', 'lat-pulldown', 'db-shoulder-press', 'plank']),
      d('Full Body B', 'Whole body', ['leg-press', 'incline-db-press', 'seated-cable-row', 'lateral-raise', 'cable-crunch']),
    ],
  },
  {
    id: 'seed-wt-fullbody-intermediate', name: 'Full Body — Intermediate', goal: 'hypertrophy', splitType: 'full_body',
    days: [
      d('Full Body A', 'Whole body', ['back-squat', 'barbell-bench-press', 'barbell-row', 'lateral-raise', 'barbell-curl', 'plank']),
      d('Full Body B', 'Whole body', ['romanian-deadlift', 'incline-db-press', 'lat-pulldown', 'overhead-press', 'triceps-pushdown', 'hanging-leg-raise']),
      d('Full Body C', 'Whole body', ['leg-press', 'machine-chest-press', 'seated-cable-row', 'face-pull', 'hammer-curl', 'cable-crunch']),
    ],
  },
  {
    id: 'seed-wt-fat-loss-beginner', name: 'Fat Loss — Beginner', goal: 'fat_loss', splitType: 'full_body',
    days: [
      d('Full Body + Cardio A', 'Strength + conditioning', ['goblet-squat', 'machine-chest-press', 'seated-cable-row', 'plank', 'treadmill-incline-walk']),
      d('Full Body + Cardio B', 'Strength + conditioning', ['leg-press', 'incline-db-press', 'lat-pulldown', 'russian-twist', 'stationary-bike']),
      d('Conditioning', 'Cardio focus', ['rowing-machine', 'jump-rope', 'walking-lunge', 'hanging-leg-raise']),
    ],
  },
  {
    id: 'seed-wt-hypertrophy-beginner', name: 'Hypertrophy — Beginner', goal: 'beginner', splitType: 'upper_lower',
    days: [
      d('Upper', 'Chest / Back / Shoulders / Arms', ['machine-chest-press', 'lat-pulldown', 'machine-shoulder-press', 'cable-curl', 'triceps-pushdown']),
      d('Lower', 'Legs', ['leg-press', 'lying-leg-curl', 'leg-extension', 'glute-bridge', 'seated-calf-raise']),
    ],
  },
  {
    id: 'seed-wt-strength-beginner', name: 'Strength — Beginner', goal: 'strength', splitType: 'full_body',
    days: [
      d('Day A', 'Squat focus', ['back-squat', 'barbell-bench-press', 'barbell-row', 'plank']),
      d('Day B', 'Deadlift focus', ['deadlift', 'overhead-press', 'lat-pulldown', 'hanging-leg-raise']),
    ],
  },
  {
    id: 'seed-wt-3day-gym', name: '3-Day Gym', goal: 'hypertrophy', splitType: 'full_body',
    days: [
      d('Day 1 — Push', 'Chest / Shoulders / Triceps', ['barbell-bench-press', 'machine-shoulder-press', 'cable-fly', 'triceps-pushdown']),
      d('Day 2 — Pull', 'Back / Biceps', ['lat-pulldown', 'seated-cable-row', 'face-pull', 'db-curl']),
      d('Day 3 — Legs', 'Legs', ['back-squat', 'romanian-deadlift', 'leg-extension', 'standing-calf-raise']),
    ],
  },
  {
    id: 'seed-wt-4day-gym', name: '4-Day Gym', goal: 'hypertrophy', splitType: 'upper_lower',
    days: [
      d('Upper A', 'Chest / Back', ['barbell-bench-press', 'barbell-row', 'incline-db-press', 'lat-pulldown', 'barbell-curl']),
      d('Lower A', 'Quads', ['back-squat', 'leg-press', 'leg-extension', 'standing-calf-raise']),
      d('Upper B', 'Shoulders / Arms', ['overhead-press', 'seated-cable-row', 'lateral-raise', 'triceps-pushdown', 'hammer-curl']),
      d('Lower B', 'Hams / Glutes', ['romanian-deadlift', 'hip-thrust', 'lying-leg-curl', 'seated-calf-raise']),
    ],
  },
  {
    id: 'seed-wt-5day-hypertrophy', name: '5-Day Hypertrophy', goal: 'advanced', splitType: 'bro_split',
    days: [
      d('Chest', 'Chest', ['barbell-bench-press', 'incline-db-press', 'cable-fly', 'dips-chest']),
      d('Back', 'Back', ['deadlift', 'lat-pulldown', 'barbell-row', 'straight-arm-pulldown']),
      d('Shoulders', 'Shoulders', ['overhead-press', 'lateral-raise', 'rear-delt-fly', 'face-pull']),
      d('Arms', 'Biceps / Triceps', ['barbell-curl', 'incline-db-curl', 'triceps-pushdown', 'overhead-triceps-ext']),
      d('Legs', 'Legs', ['back-squat', 'romanian-deadlift', 'leg-press', 'lying-leg-curl', 'standing-calf-raise']),
    ],
  },
];
