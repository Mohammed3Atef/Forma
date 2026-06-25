import type { LibraryFood, WorkoutGoal, SplitType } from '@/types';

/**
 * Static starter FOODS, food-groups, and workout-TEMPLATE blueprints for new
 * coaches ("Load starter library"). Seeded into `coachAssets/{coachId}` via
 * starterLibraryApi with deterministic `seed-*` ids (re-running overwrites,
 * never duplicates). Foods are fully bilingual.
 *
 * EXERCISES are NOT defined here — they come from the shared public-domain
 * dataset at `public/data/exercise-library.json` (fetched at runtime by
 * starterLibraryApi so it never bloats the JS bundle). Templates below reference
 * exercises by MUSCLE GROUP and are filled from that dataset at seed time.
 */

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
// Each day lists `targetMuscle` groups (matching the dataset's values); at seed
// time starterLibraryApi fills the day by drawing exercises round-robin across
// those groups, so a template stays valid for whatever exercise set is loaded.

export interface StarterTemplateDay {
  title: string;
  focus: string;
  /** `targetMuscle` groups to draw exercises from (round-robin). */
  muscles: string[];
  /** How many exercises to fill the day with (default 6). */
  count?: number;
}
export interface StarterTemplate {
  id: string;
  name: string;
  goal: WorkoutGoal;
  splitType: SplitType;
  days: StarterTemplateDay[];
}

const PUSH = ['Chest', 'Shoulders', 'Triceps'];
const PULL = ['Lats', 'Middle Back', 'Traps', 'Biceps'];
const LEGS = ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves'];
const UPPER = ['Chest', 'Middle Back', 'Lats', 'Shoulders', 'Biceps', 'Triceps'];
const LOWER = ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Adductors'];
const FULL = ['Quadriceps', 'Chest', 'Middle Back', 'Shoulders', 'Hamstrings', 'Abdominals'];

const day = (title: string, focus: string, muscles: string[], count = 6): StarterTemplateDay => ({ title, focus, muscles, count });

export const STARTER_TEMPLATES: StarterTemplate[] = [
  { id: 'seed-wt-ppl', name: 'Push / Pull / Legs', goal: 'hypertrophy', splitType: 'ppl', days: [
    day('Push', 'Chest / Shoulders / Triceps', PUSH),
    day('Pull', 'Back / Traps / Biceps', PULL),
    day('Legs', 'Quads / Hams / Glutes / Calves', LEGS),
  ] },
  { id: 'seed-wt-upper-lower', name: 'Upper / Lower', goal: 'hypertrophy', splitType: 'upper_lower', days: [
    day('Upper', 'Chest / Back / Shoulders / Arms', UPPER),
    day('Lower', 'Quads / Hams / Glutes / Calves', LOWER),
  ] },
  { id: 'seed-wt-fullbody-beginner', name: 'Full Body — Beginner', goal: 'beginner', splitType: 'full_body', days: [
    day('Full Body A', 'Whole body', FULL, 5),
    day('Full Body B', 'Whole body', ['Hamstrings', 'Chest', 'Lats', 'Shoulders', 'Abdominals'], 5),
  ] },
  { id: 'seed-wt-fullbody-intermediate', name: 'Full Body — Intermediate', goal: 'hypertrophy', splitType: 'full_body', days: [
    day('Full Body A', 'Whole body', FULL),
    day('Full Body B', 'Whole body', ['Hamstrings', 'Chest', 'Middle Back', 'Shoulders', 'Triceps', 'Abdominals']),
    day('Full Body C', 'Whole body', ['Glutes', 'Lats', 'Quadriceps', 'Biceps', 'Calves', 'Abdominals']),
  ] },
  { id: 'seed-wt-3day', name: '3-Day Split', goal: 'hypertrophy', splitType: 'ppl', days: [
    day('Day 1 — Push', 'Chest / Shoulders / Triceps', PUSH, 5),
    day('Day 2 — Pull', 'Back / Biceps', PULL, 5),
    day('Day 3 — Legs', 'Legs', LEGS, 5),
  ] },
  { id: 'seed-wt-4day', name: '4-Day Upper / Lower', goal: 'hypertrophy', splitType: 'upper_lower', days: [
    day('Upper A', 'Chest / Back', ['Chest', 'Middle Back', 'Lats', 'Biceps'], 5),
    day('Lower A', 'Quads focus', ['Quadriceps', 'Calves', 'Glutes'], 5),
    day('Upper B', 'Shoulders / Arms', ['Shoulders', 'Triceps', 'Biceps', 'Traps'], 5),
    day('Lower B', 'Hams / Glutes', ['Hamstrings', 'Glutes', 'Adductors', 'Calves'], 5),
  ] },
  { id: 'seed-wt-5day', name: '5-Day Body-Part Split', goal: 'advanced', splitType: 'bro_split', days: [
    day('Chest', 'Chest', ['Chest'], 5),
    day('Back', 'Back', ['Lats', 'Middle Back', 'Lower Back', 'Traps'], 6),
    day('Shoulders', 'Shoulders', ['Shoulders'], 5),
    day('Arms', 'Biceps / Triceps', ['Biceps', 'Triceps'], 6),
    day('Legs', 'Legs', LEGS, 6),
  ] },
  { id: 'seed-wt-fatloss', name: 'Fat Loss — Full Body', goal: 'fat_loss', splitType: 'full_body', days: [
    day('Full Body A', 'High-rep circuit', FULL, 6),
    day('Full Body B', 'High-rep circuit', ['Quadriceps', 'Chest', 'Lats', 'Shoulders', 'Abdominals', 'Calves'], 6),
  ] },
  { id: 'seed-wt-strength-beginner', name: 'Strength — Beginner', goal: 'strength', splitType: 'full_body', days: [
    day('Day A', 'Squat / Press', ['Quadriceps', 'Chest', 'Middle Back', 'Abdominals'], 4),
    day('Day B', 'Hinge / Pull', ['Hamstrings', 'Shoulders', 'Lats', 'Abdominals'], 4),
  ] },
];
