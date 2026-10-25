/**
 * B4 — the Forma catalog vocabulary: stable ids with EN / Arabic (MSA) labels. Datasets may only
 * use these ids (enforced by `schemas.ts`); the app shows the labels in the reader's language.
 * Egyptian gym words a coach would type ("أستك", "عقلة", "طارة") live in each item's `aliases.eg`,
 * and the search also matches these labels — so filters and search share one vocabulary.
 */
export interface Label {
  en: string;
  ar: string;
}

export const MUSCLES = {
  chest: { en: 'Chest', ar: 'الصدر' },
  'front-delts': { en: 'Front delts', ar: 'الكتف الأمامي' },
  'side-delts': { en: 'Side delts', ar: 'الكتف الجانبي' },
  'rear-delts': { en: 'Rear delts', ar: 'الكتف الخلفي' },
  lats: { en: 'Lats', ar: 'العضلة الظهرية العريضة' },
  'upper-back': { en: 'Upper back', ar: 'أعلى الظهر' },
  traps: { en: 'Traps', ar: 'العضلة شبه المنحرفة (الترابيس)' },
  'lower-back': { en: 'Lower back', ar: 'أسفل الظهر' },
  biceps: { en: 'Biceps', ar: 'العضلة ذات الرأسين (البايسبس)' },
  triceps: { en: 'Triceps', ar: 'العضلة ثلاثية الرؤوس (الترايسبس)' },
  forearms: { en: 'Forearms', ar: 'الساعد' },
  abs: { en: 'Abs', ar: 'عضلات البطن' },
  obliques: { en: 'Obliques', ar: 'العضلات المائلة' },
  glutes: { en: 'Glutes', ar: 'عضلات الأرداف' },
  quads: { en: 'Quads', ar: 'الفخذ الأمامي' },
  hamstrings: { en: 'Hamstrings', ar: 'الفخذ الخلفي' },
  adductors: { en: 'Adductors (inner thigh)', ar: 'الفخذ الداخلي (المقرِّبات)' },
  abductors: { en: 'Abductors (outer hip)', ar: 'الورك الخارجي (المبعِّدات)' },
  calves: { en: 'Calves', ar: 'السمانة' },
  'hip-flexors': { en: 'Hip flexors', ar: 'مثنيات الورك' },
  // B4.2 (ExerciseDB): sources that name the shoulder as a whole, and muscles outside the B4 list.
  delts: { en: 'Shoulders (deltoids)', ar: 'عضلات الكتف (الدالية)' },
  serratus: { en: 'Serratus anterior', ar: 'العضلة المنشارية الأمامية' },
  'rotator-cuff': { en: 'Rotator cuff', ar: 'الكفة المدورة' },
  neck: { en: 'Neck', ar: 'الرقبة' },
  cardio: { en: 'Heart & lungs (cardio)', ar: 'القلب والرئتان (كارديو)' },
} as const satisfies Record<string, Label>;
export type MuscleId = keyof typeof MUSCLES;

export const EQUIPMENT = {
  barbell: { en: 'Barbell', ar: 'بار حديد' },
  dumbbell: { en: 'Dumbbell', ar: 'دمبل' },
  kettlebell: { en: 'Kettlebell', ar: 'كيتل بل' },
  'ez-bar': { en: 'EZ bar', ar: 'بار زجزاج (EZ)' },
  'trap-bar': { en: 'Trap bar', ar: 'بار سداسي' },
  cable: { en: 'Cable', ar: 'كابل' },
  machine: { en: 'Machine', ar: 'جهاز' },
  'smith-machine': { en: 'Smith machine', ar: 'جهاز سميث' },
  bench: { en: 'Bench', ar: 'بنش' },
  'pull-up-bar': { en: 'Pull-up bar', ar: 'عقلة' },
  'dip-station': { en: 'Dip station', ar: 'متوازي' },
  band: { en: 'Resistance band', ar: 'حبل مقاومة مطاطي' },
  bodyweight: { en: 'Bodyweight', ar: 'وزن الجسم' },
  suspension: { en: 'Suspension trainer', ar: 'حبال التعليق (TRX)' },
  'medicine-ball': { en: 'Medicine ball', ar: 'كرة طبية' },
  'stability-ball': { en: 'Stability ball', ar: 'كرة التوازن' },
  plate: { en: 'Weight plate', ar: 'قرص حديد' },
  landmine: { en: 'Landmine', ar: 'لاندماين' },
  box: { en: 'Box / step', ar: 'صندوق / درجة' },
  'ab-wheel': { en: 'Ab wheel', ar: 'عجلة البطن' },
  'foam-roller': { en: 'Foam roller', ar: 'أسطوانة الإسفنج (فوم رولر)' },
  'jump-rope': { en: 'Jump rope', ar: 'حبل القفز' },
  treadmill: { en: 'Treadmill', ar: 'جهاز المشي' },
  bike: { en: 'Stationary bike', ar: 'دراجة ثابتة' },
  rower: { en: 'Rowing machine', ar: 'جهاز التجديف' },
  elliptical: { en: 'Elliptical trainer', ar: 'جهاز الإليبتيكال' },
  'battle-ropes': { en: 'Battle ropes', ar: 'حبال المعركة' },
  // B4.2 (ExerciseDB)
  'bosu-ball': { en: 'BOSU ball', ar: 'كرة البوسو' },
  'added-weight': { en: 'Added weight (plate, vest, belt)', ar: 'وزن إضافي (قرص، سترة، حزام)' },
  other: { en: 'Other equipment', ar: 'أدوات أخرى' },
} as const satisfies Record<string, Label>;
export type EquipmentId = keyof typeof EQUIPMENT;

export const PATTERNS = {
  'horizontal-push': { en: 'Horizontal push', ar: 'دفع أفقي' },
  'vertical-push': { en: 'Vertical push', ar: 'دفع رأسي' },
  'horizontal-pull': { en: 'Horizontal pull', ar: 'سحب أفقي' },
  'vertical-pull': { en: 'Vertical pull', ar: 'سحب رأسي' },
  squat: { en: 'Squat', ar: 'قرفصاء (سكوات)' },
  hinge: { en: 'Hip hinge', ar: 'ثني الورك' },
  lunge: { en: 'Lunge / single leg', ar: 'طعن / رجل واحدة' },
  carry: { en: 'Carry', ar: 'حمل ومشي' },
  core: { en: 'Core', ar: 'الجذع' },
  isolation: { en: 'Isolation', ar: 'عزل' },
  conditioning: { en: 'Conditioning', ar: 'لياقة' },
  mobility: { en: 'Mobility', ar: 'مرونة وحركية' },
} as const satisfies Record<string, Label>;
export type PatternId = keyof typeof PATTERNS;

export const BODY_PARTS = {
  chest: { en: 'Chest', ar: 'الصدر' },
  back: { en: 'Back', ar: 'الظهر' },
  shoulders: { en: 'Shoulders', ar: 'الأكتاف' },
  arms: { en: 'Arms', ar: 'الذراعان' },
  legs: { en: 'Legs', ar: 'الرجلان' },
  glutes: { en: 'Glutes', ar: 'الأرداف' },
  core: { en: 'Core', ar: 'البطن والجذع' },
  'full-body': { en: 'Full body', ar: 'الجسم كله' },
  cardio: { en: 'Cardio', ar: 'كارديو' },
  neck: { en: 'Neck', ar: 'الرقبة' },
} as const satisfies Record<string, Label>;
export type BodyPartId = keyof typeof BODY_PARTS;

export const DIFFICULTY = {
  beginner: { en: 'Beginner', ar: 'مبتدئ' },
  intermediate: { en: 'Intermediate', ar: 'متوسط' },
  advanced: { en: 'Advanced', ar: 'متقدم' },
} as const satisfies Record<string, Label>;
export type DifficultyId = keyof typeof DIFFICULTY;

export const FOOD_CATEGORIES = {
  grains: { en: 'Grains, rice & pasta', ar: 'الحبوب والأرز والمكرونة' },
  bread: { en: 'Bread & bakery', ar: 'الخبز والمخبوزات' },
  legumes: { en: 'Beans & legumes', ar: 'البقوليات' },
  meat: { en: 'Meat', ar: 'اللحوم' },
  poultry: { en: 'Poultry', ar: 'الدواجن' },
  seafood: { en: 'Fish & seafood', ar: 'الأسماك والمأكولات البحرية' },
  eggs: { en: 'Eggs', ar: 'البيض' },
  dairy: { en: 'Milk & yogurt', ar: 'الألبان والزبادي' },
  cheese: { en: 'Cheese', ar: 'الجبن' },
  vegetables: { en: 'Vegetables', ar: 'الخضروات' },
  fruits: { en: 'Fruits', ar: 'الفواكه' },
  'nuts-seeds': { en: 'Nuts & seeds', ar: 'المكسرات والبذور' },
  'fats-oils': { en: 'Oils & fats', ar: 'الزيوت والدهون' },
  sweets: { en: 'Sweets & desserts', ar: 'الحلويات' },
  drinks: { en: 'Drinks', ar: 'المشروبات' },
  condiments: { en: 'Sauces & condiments', ar: 'الصلصات والتوابل' },
  dishes: { en: 'Dishes (recipe-based)', ar: 'أطباق (محسوبة من وصفة)' },
} as const satisfies Record<string, Label>;
export type FoodCategoryId = keyof typeof FOOD_CATEGORIES;

export const FOOD_STATES = {
  raw: { en: 'Raw', ar: 'نيء' },
  cooked: { en: 'Cooked', ar: 'مطبوخ' },
  dry: { en: 'Dry (uncooked)', ar: 'جاف (غير مطبوخ)' },
  prepared: { en: 'Prepared', ar: 'مُحضَّر' },
  'as-sold': { en: 'As sold', ar: 'كما يُباع' },
} as const satisfies Record<string, Label>;
export type FoodStateId = keyof typeof FOOD_STATES;

/** Licences an imported item may carry. Anything else is refused by the dataset schema. */
export const LICENSES = {
  'CC0-1.0': { en: 'CC0 1.0 (public domain)', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC-BY-SA-3.0': { en: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' },
  'CC-BY-SA-4.0': { en: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'FORMA-PROPRIETARY': { en: '© Forma', url: 'https://www.useforma.fit/legal' },
  // B4.2: ExerciseDB V1 — use confirmed by the owner with the provider; credit to AscendAPI required.
  EXERCISEDB: { en: 'ExerciseDB (AscendAPI)', url: 'https://ascendapi.com' },
} as const;
export type LicenseId = keyof typeof LICENSES;

export const TAXONOMY = { muscles: MUSCLES, equipment: EQUIPMENT, patterns: PATTERNS, bodyParts: BODY_PARTS, difficulty: DIFFICULTY, foodCategories: FOOD_CATEGORIES, foodStates: FOOD_STATES } as const;
