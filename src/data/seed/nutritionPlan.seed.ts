import type { FoodItem, MealPlan } from '@/types';

/**
 * Parsed from the coaching Google Sheet (gid=0, "خارجي"). Meals list exact
 * post-cooking gram amounts. Per-item macros are estimated from standard food
 * values (the sheet only gives daily totals: 1815 kcal / 158P / 180C / 53F),
 * and can be fine-tuned in the Nutrition screen. Labels are bilingual.
 */

function food(
  id: string,
  en: string,
  ar: string,
  quantity: string,
  protein: number,
  carbs: number,
  fats: number,
): FoodItem {
  const calories = Math.round(protein * 4 + carbs * 4 + fats * 9);
  return { id, name: { en, ar }, quantity, protein, carbs, fats, calories };
}

export const SEED_MEAL_PLAN: MealPlan = {
  id: 'plan_m3e_nutrition',
  name: 'M3E — Daily Nutrition',
  updatedAt: 0,
  targets: { calories: 1815, protein: 158, carbs: 180, fats: 53 },
  waterTargetMl: 4000,
  meals: [
    {
      id: 'meal_1',
      slot: 'breakfast',
      label: { en: 'Meal 1', ar: 'الوجبة الأولى' },
      items: [
        food('m1_riceflour', 'Rice flour', 'دقيق أرز', '60 g', 5, 47, 1),
        food('m1_strawberry', 'Strawberries', 'فراولة', '100 g', 1, 8, 0),
        food('m1_cinnamon', 'Cinnamon', 'رشة قرفة', 'pinch', 0, 0, 0),
        food('m1_eggs', 'Eggs (3, one white only)', '٣ بيضات (واحدة بياض)', '3 eggs', 18, 1, 14),
      ],
    },
    {
      id: 'meal_2',
      slot: 'lunch',
      label: { en: 'Meal 2', ar: 'الوجبة الثانية' },
      items: [
        food('m2_rice', 'White rice', 'أرز أبيض', '175 g', 5, 50, 0),
        food('m2_chicken', 'Chicken breast', 'صدور فراخ', '250 g', 58, 0, 8),
        food('m2_cucumber', 'Cucumber (peeled)', 'خيار بدون قشر', '200 g', 1, 6, 0),
      ],
    },
    {
      id: 'meal_3',
      slot: 'dinner',
      label: { en: 'Meal 3', ar: 'الوجبة الثالثة' },
      items: [
        food('m3_rice', 'White rice', 'أرز أبيض', '175 g', 5, 50, 0),
        food('m3_chicken', 'Chicken breast', 'صدور فراخ', '250 g', 58, 0, 8),
        food('m3_peppers', 'Bell peppers', 'فلفل ألوان', '150 g', 1, 9, 0),
      ],
    },
    {
      id: 'meal_4',
      slot: 'snack',
      label: { en: 'Meal 4', ar: 'الوجبة الرابعة' },
      items: [
        food('m4_sweetpotato', 'Sweet potato', 'بطاطا', '200 g', 4, 41, 0),
        food('m4_almonds', 'Almonds', 'لوز', '30 g', 6, 6, 15),
      ],
    },
  ],
  supplements: [
    { id: 'sup_d3', name: 'Limitless Ossofortin D3', dose: { en: 'Half pill after breakfast', ar: 'نص حبة بعد الفطار' } },
    { id: 'sup_c', name: 'C-Retard 500mg', dose: { en: '1 pill after breakfast', ar: 'حبة بعد الفطار' } },
    { id: 'sup_omega', name: 'Omega 3 Plus', dose: { en: '1 pill after breakfast', ar: 'حبة بعد الفطار' } },
    { id: 'sup_mag', name: 'Mag White', dose: { en: '1 pill 45 min before sleep', ar: 'حبة قبل النوم بـ ٤٥ دقيقة' } },
  ],
  beverageNotes: [
    { en: 'Anything with caffeine: at least 6 hours before sleep.', ar: 'أي شيء يحتوي على كافيين يُشرب قبل النوم بـ ٦ ساعات على الأقل.' },
    { en: 'Avoid juices entirely — they lose the fibre you need.', ar: 'تجنب العصائر تماماً لأنها فقدت الألياف التي تحتاجها.' },
    { en: '4 litres of water spread across the day; 6 g salt spread across meals.', ar: '٤ لتر ماء موزعة على اليوم، و ٦ جرام ملح موزعة على الوجبات.' },
  ],
  generalNotes: [
    { en: 'Food weight is always measured after cooking — mind your grams.', ar: 'وزن الأكل دائماً بعد الطهي، وخلي بالك من الجرامات.' },
    { en: 'Keep 3–4 hours between meals to maintain blood amino-acid levels, sustain muscle building, and improve insulin sensitivity.', ar: 'اترك من ٣ لـ ٤ ساعات بين كل وجبة للحفاظ على الأحماض الأمينية وبناء العضل وتحسين حساسية الأنسولين.' },
  ],
};
