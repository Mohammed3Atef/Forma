/**
 * B4 — the app's copy of THE nutrition calculation (`api/catalog/_lib/nutrition.ts`; the `@/*`
 * alias can't cross into the API bundle, so it is mirrored and `catalogNutritionParity.test.ts`
 * keeps the two identical). A serving is resolved to grams first (amount × the portion's gram
 * weight); each value = per100g × grams / 100, rounded once — energy to whole kcal, macros to 0.1 g.
 */
export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Serving {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

/** Half away from zero at `dp` decimals, immune to binary noise (1.005 → 1.01). */
export function roundTo(n: number, dp: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dp;
  const x = Math.abs(n) * f;
  const r = Math.round(Number(x.toPrecision(12)));
  return (Math.sign(n) * r) / f;
}

/** Grams for `amount` of a portion (or of grams when no portion), rounded to 0.1 g. */
export function servingGrams(amount: number, portion?: { grams: number } | null): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return roundTo(portion ? amount * portion.grams : amount, 1);
}

export function nutrientsFor(per100g: Per100g, grams: number): Serving {
  const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
  const k = g / 100;
  const out: Serving = {
    grams: roundTo(g, 1),
    kcal: roundTo(per100g.kcal * k, 0),
    protein: roundTo(per100g.protein * k, 1),
    carbs: roundTo(per100g.carbs * k, 1),
    fat: roundTo(per100g.fat * k, 1),
  };
  if (per100g.fiber !== undefined) out.fiber = roundTo(per100g.fiber * k, 1);
  return out;
}

/** Sum of already-rounded servings (what the reader sees row by row). */
export function sumServings(items: Pick<Serving, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Pick<Serving, 'kcal' | 'protein' | 'carbs' | 'fat'> {
  const t = items.reduce((a, s) => ({ kcal: a.kcal + s.kcal, protein: a.protein + s.protein, carbs: a.carbs + s.carbs, fat: a.fat + s.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { kcal: roundTo(t.kcal, 0), protein: roundTo(t.protein, 1), carbs: roundTo(t.carbs, 1), fat: roundTo(t.fat, 1) };
}
