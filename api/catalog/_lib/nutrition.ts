/**
 * B4 — THE nutrition calculation (one method, deterministic rounding). Mirrored for the app in
 * `src/lib/catalogNutrition.ts`; `src/lib/catalogNutritionParity.test.ts` keeps the two identical.
 *
 * Values are stored per 100 g of the food as described (raw OR cooked — never mixed). A serving is
 * always resolved to grams first: grams = amount × the portion's gram weight (a portion is only
 * ever food-specific evidence — USDA household measures, a package label, or a recipe yield; a
 * "cup" or "piece" never gets a generic weight). Then each nutrient = per100g × grams / 100, rounded
 * ONCE: energy to whole kcal, macros to 0.1 g. Totals add the rounded item values, so a plan's
 * total always equals the sum of the rows a reader sees.
 */
export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

export interface Portion {
  id: string;
  grams: number;
}

export interface Serving {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

/** Half away from zero at `dp` decimals, immune to binary noise (1.005 → 1.01, 2.675 → 2.68). */
export function roundTo(n: number, dp: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** dp;
  const x = Math.abs(n) * f;
  const r = Math.round(Number(x.toPrecision(12)));
  return (Math.sign(n) * r) / f;
}

/** Grams for `amount` of a portion (or of grams when no portion), rounded to 0.1 g. */
export function servingGrams(amount: number, portion?: Portion | null): number {
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

/** Energy implied by the macros (4/4/9) — a plausibility check on a record, never a substitute for it. */
export function atwaterKcal(p: Pick<Per100g, 'protein' | 'carbs' | 'fat'>): number {
  return p.protein * 4 + p.carbs * 4 + p.fat * 9;
}

/** Sum of already-rounded servings (what the reader sees row by row). */
export function sumServings(items: Pick<Serving, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Pick<Serving, 'kcal' | 'protein' | 'carbs' | 'fat'> {
  const t = items.reduce((a, s) => ({ kcal: a.kcal + s.kcal, protein: a.protein + s.protein, carbs: a.carbs + s.carbs, fat: a.fat + s.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  return { kcal: roundTo(t.kcal, 0), protein: roundTo(t.protein, 1), carbs: roundTo(t.carbs, 1), fat: roundTo(t.fat, 1) };
}

/**
 * Per-100 g values of a recipe from its ingredients (grams of each, as weighed in the dish) and the
 * finished dish's weight. `yieldGrams` defaults to the ingredient sum (no water loss/gain).
 */
export function recipePer100g(ingredients: { per100g: Per100g; grams: number }[], yieldGrams?: number): Per100g {
  const sum = (k: keyof Per100g) => ingredients.reduce((a, i) => a + ((i.per100g[k] ?? 0) * i.grams) / 100, 0);
  const total = yieldGrams ?? ingredients.reduce((a, i) => a + i.grams, 0);
  if (!(total > 0)) return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const per = (k: keyof Per100g) => roundTo((sum(k) / total) * 100, 2);
  const out: Per100g = { kcal: per('kcal'), protein: per('protein'), carbs: per('carbs'), fat: per('fat') };
  if (ingredients.every((i) => i.per100g.fiber !== undefined)) out.fiber = per('fiber');
  return out;
}
