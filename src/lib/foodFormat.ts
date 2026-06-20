import type { FoodItem } from '@/types';

type MacroBits = Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fats'>;

/** True when a food carries any non-zero macro — i.e. a macro line is worth showing. */
export function hasMacros(f: MacroBits): boolean {
  return f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fats > 0;
}

/**
 * One-line food detail: "100g · 130 kcal · P2.7 C28 F0.3". Drops the macro part
 * when everything is zero (show just what was entered) and the quantity when
 * blank. Returns '' when there's nothing to show, so callers can skip the line.
 */
export function foodLine(f: Pick<FoodItem, 'quantity'> & MacroBits): string {
  const macros = hasMacros(f) ? `${f.calories} kcal · P${f.protein} C${f.carbs} F${f.fats}` : '';
  return [f.quantity, macros].filter(Boolean).join(' · ');
}
