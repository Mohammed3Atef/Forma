import { applyFoodEdit } from './nutritionPlanModel';
import { provenanceOf } from './catalogText';
import type { FoodPick } from './catalogCopy';
import type { LibraryFood, LocalizedText, Meal, MealPlan, MealSlot } from '@/types';

/**
 * Foods handed to a client's nutrition plan (B3.7 "Use in a client plan"; B4.3 the one food library).
 * The plan item is made exactly as the food sheet makes it, so a plan never gets a different shape
 * depending on how the food was added:
 *  - the coach's own food: its values and provenance, both languages (`foodFromLibrary`);
 *  - a Forma food: a serving computed from per-100 g values, with its source and picture (`foodFromPick`).
 * Nothing is written here — the coach saves through the editor (`usePlanEditor`). Pure: reading a
 * food by id is `foodUse`.
 */

export interface MealTarget {
  mealId: string;
  label: LocalizedText;
  count: number;
}

export function mealTargets(plan: Pick<MealPlan, 'meals'>): MealTarget[] {
  return plan.meals.map((m) => ({ mealId: m.id, label: m.label, count: m.items.length }));
}

/** The plan item a library food becomes — the same item the food sheet makes from a library pick. */
export function foodFromLibrary(food: LibraryFood, newId: () => string) {
  const prov = provenanceOf(food);
  return applyFoodEdit(
    null,
    newId(),
    { name: food.name, quantity: food.quantity ?? '', calories: Number(food.calories) || 0, protein: Number(food.protein) || 0, carbs: Number(food.carbs) || 0, fats: Number(food.fats) || 0, group: undefined, allowCustom: false, image: food.image ?? undefined, provenance: prov ?? undefined },
    newId,
  );
}

/** The plan item a Forma food becomes at a chosen serving (`foodPickFromCatalog`): computed macros with their source, and its picture. */
export function foodFromPick(pick: FoodPick, newId: () => string) {
  return applyFoodEdit(null, newId(), { name: pick.name, quantity: pick.quantity, ...pick.macros, group: undefined, allowCustom: false, image: pick.image ?? undefined, provenance: pick.provenance }, newId);
}

/** Adds a library food (or a Forma food's serving) to the end of a meal — or to a new meal at the end of the plan. */
export function addLibraryFood(
  plan: MealPlan,
  target: { mealId: string } | { newMeal: { id: string; label: LocalizedText; slot: MealSlot } },
  food: LibraryFood | { pick: FoodPick },
  newId: () => string,
): { plan: MealPlan; mealId: string; itemId: string } {
  const item = 'pick' in food ? foodFromPick(food.pick, newId) : foodFromLibrary(food, newId);
  if ('newMeal' in target) {
    const meal: Meal = { ...target.newMeal, items: [item] };
    return { plan: { ...plan, meals: [...plan.meals, meal] }, mealId: meal.id, itemId: item.id };
  }
  return {
    plan: { ...plan, meals: plan.meals.map((m) => (m.id === target.mealId ? { ...m, items: [...m.items, item] } : m)) },
    mealId: target.mealId,
    itemId: item.id,
  };
}
