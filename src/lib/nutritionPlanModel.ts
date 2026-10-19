import type { FoodItem, LocalizedText, Macros, Meal, MealPlan } from '../types';

/**
 * Pure rules of the nutrition editor (B3.5). Planned totals are real sums of the plan's own foods —
 * never fabricated; a food with no macros entered (all zero) is counted as incomplete, not as
 * "0 kcal". Edits keep every field the coach did not change (ids, alternatives snapshots, the other
 * language), because the client's logs are keyed by meal and food ids.
 */

export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fats'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

const isBlank = (f: FoodItem) => !f.calories && !f.protein && !f.carbs && !f.fats;

export function plannedTotals(plan: Pick<MealPlan, 'meals'>): { planned: Macros; incomplete: number } {
  const planned: Macros = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  let incomplete = 0;
  for (const m of plan.meals) {
    for (const f of m.items) {
      if (isBlank(f)) incomplete += 1;
      for (const k of MACRO_KEYS) planned[k] += Number(f[k]) || 0;
    }
  }
  return { planned, incomplete };
}

export function mealCalories(items: FoodItem[]): number {
  return items.reduce((n, f) => n + (Number(f.calories) || 0), 0);
}

export interface FoodEdit {
  name: LocalizedText;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  /** `undefined` = alternatives untouched; `null` = none; a group = re-snapshot its foods. */
  group?: { id: string; foods: FoodItem[] } | null;
  allowCustom: boolean;
}

/** Library foods snapshotted onto a plan item: plain items, no undefined keys. */
export function snapshotFood(f: FoodItem, newId: () => string): FoodItem {
  return { id: f.id || newId(), name: f.name, quantity: f.quantity, protein: f.protein, carbs: f.carbs, fats: f.fats, calories: f.calories };
}

/**
 * Applies the food sheet's values to an item. Unchanged fields keep their original value exactly;
 * the alternatives snapshot changes only when the coach picks another group (or none) — a group
 * deleted from the library since keeps the snapshot the client already has.
 */
export function applyFoodEdit(orig: FoodItem | null, id: string, e: FoodEdit, newId: () => string): FoodItem {
  const base: FoodItem = orig ? { ...orig } : { id, name: { en: '', ar: '' }, quantity: '', calories: 0, protein: 0, carbs: 0, fats: 0 };
  const next: FoodItem = { ...base, id };
  if (!orig || e.name.en !== orig.name.en || (e.name.ar ?? '') !== (orig.name.ar ?? '')) next.name = e.name;
  if (!orig || e.quantity.trim() !== (orig.quantity ?? '').trim()) next.quantity = e.quantity.trim();
  for (const k of MACRO_KEYS) if (!orig || e[k] !== orig[k]) next[k] = Math.max(0, e[k]);
  if (e.group === null) {
    delete next.allowedAlternativeGroupId;
    delete next.allowedAlternatives;
  } else if (e.group) {
    next.allowedAlternativeGroupId = e.group.id;
    next.allowedAlternatives = e.group.foods.map((f) => snapshotFood(f, newId));
  }
  if (e.allowCustom) next.allowCustomSubstitution = true;
  else delete next.allowCustomSubstitution;
  return next;
}

/** Bilingual note lists (general / beverage notes): blank rows are dropped on save. */
export function cleanNotes(notes: LocalizedText[]): LocalizedText[] {
  return notes.filter((n) => n.en.trim() || (n.ar ?? '').trim());
}

/**
 * Working shape for the editor: a stored plan missing a list or a label (older / malformed data)
 * opens instead of breaking — nothing is invented, and nothing is written until the coach saves.
 * Returns the same object when the plan is complete.
 */
export function normalizeMealPlan(p: MealPlan): MealPlan {
  const mealOk = (m: Meal) => !!m.label && Array.isArray(m.items) && m.items.every((f) => !!f.name);
  if (Array.isArray(p.meals) && p.meals.every(mealOk) && Array.isArray(p.supplements) && p.targets && p.supplements.every((s) => !!s.dose)) return p;
  return {
    ...p,
    meals: (Array.isArray(p.meals) ? p.meals : []).map((m) =>
      mealOk(m) ? m : { ...m, label: m.label ?? { en: '', ar: '' }, items: (Array.isArray(m.items) ? m.items : []).map((f) => (f.name ? f : { ...f, name: { en: '', ar: '' } })) },
    ),
    supplements: (Array.isArray(p.supplements) ? p.supplements : []).map((s) => (s.dose ? s : { ...s, dose: { en: '', ar: '' } })),
    targets: p.targets ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
  };
}
