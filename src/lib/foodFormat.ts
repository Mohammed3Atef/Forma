import type { FoodItem } from '@/types';
import { servingText } from './catalogText';

type MacroBits = Pick<FoodItem, 'calories' | 'protein' | 'carbs' | 'fats'>;

/** True when a food carries any non-zero macro — i.e. a macro line is worth showing. */
export function hasMacros(f: MacroBits): boolean {
  return f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fats > 0;
}

/** The serving to show: a catalog portion in the reader's language (with grams), else the stored text. */
export function quantityText(f: Pick<FoodItem, 'quantity' | 'portion'>, lang = 'en'): string {
  return f.portion ? servingText(f.portion, lang) : f.quantity;
}

/**
 * One-line food detail: "100g · 130 kcal · P2.7 C28 F0.3". Drops the macro part
 * when everything is zero (show just what was entered) and the quantity when
 * blank. Returns '' when there's nothing to show, so callers can skip the line.
 */
export function foodLine(f: Pick<FoodItem, 'quantity' | 'portion'> & MacroBits, lang = 'en'): string {
  const macros = hasMacros(f) ? `${f.calories} kcal · P${f.protein} C${f.carbs} F${f.fats}` : '';
  // B4: a catalog serving reads in the reader's language; older rows keep their free-text quantity.
  const quantity = quantityText(f, lang);
  return [quantity, macros].filter(Boolean).join(' · ');
}
