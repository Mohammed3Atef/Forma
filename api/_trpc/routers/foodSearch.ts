import { z } from 'zod';
import { router, authedProcedure } from '../trpc.js';

/**
 * Live proxy search against wger.de's free, public, no-auth ingredient
 * database (`/api/v2/ingredient/`, backed by Open Food Facts) — used by the
 * coach nutrition editor and the client's custom-food entry as a third
 * option alongside "type manually" / "pick from your library". Deliberately
 * a PROXY, not a bulk import (unlike the ~900-exercise starter catalog,
 * wger's ingredient set is far too large to import wholesale) — see
 * `scripts/importWgerExercises.mjs` for the exercise-side equivalent.
 *
 * LICENSING NOTE (see the implementation report): wger's exercise/ingredient
 * *metadata* is CC BY-SA 3.0, but the underlying ingredient VALUES are
 * sourced from Open Food Facts, which is typically ODbL-licensed — a
 * different license family. This has not been independently re-verified
 * against wger's current terms; treat as a documented open item to confirm
 * before this reaches real production traffic, not as a resolved fact.
 */

const API = 'https://wger.de/api/v2';
// Confirmed via a live GET to /api/v2/language/ during implementation —
// stable reference ids, not expected to change, so not worth an extra
// request-time round trip to re-resolve on every search.
const EN_LANG_ID = 2;
const AR_LANG_ID = 17;

export interface FoodSearchResult {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  sourceId: string;
  sourceProvider: 'wger';
  /** Per-100g values this result was computed from — lets the client scale to any serving size without re-querying. */
  sourceNutrition: { baseGrams: number; calories: number; protein: number; carbs: number; fats: number };
}

interface WgerIngredient {
  id: number;
  name: string;
  energy: number;
  protein: string;
  carbohydrates: string;
  fat: string;
}
interface WgerIngredientPage {
  results: WgerIngredient[];
}

// Module-scoped, in-memory, best-effort cache — reference data that doesn't
// need second-by-second freshness. Only helps within one warm serverless
// instance's lifetime (same "pay once" tradeoff as `exerciseLibrary.ts`'s
// module cache); a cold start just re-fetches, which is fine for this data.
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; results: FoodSearchResult[] }>();

function mapResult(ing: WgerIngredient): FoodSearchResult {
  const num = (s: string) => Math.round(parseFloat(s) * 10) / 10;
  return {
    id: `wger-food-${ing.id}`,
    name: ing.name,
    quantity: '100 g',
    calories: Math.round(ing.energy),
    protein: num(ing.protein),
    carbs: num(ing.carbohydrates),
    fats: num(ing.fat),
    sourceId: String(ing.id),
    sourceProvider: 'wger',
    sourceNutrition: { baseGrams: 100, calories: Math.round(ing.energy), protein: num(ing.protein), carbs: num(ing.carbohydrates), fats: num(ing.fat) },
  };
}

export const foodSearchRouter = router({
  search: authedProcedure
    .input(z.object({ query: z.string().trim().min(2).max(100), language: z.enum(['en', 'ar']).optional() }))
    .query(async ({ input }): Promise<FoodSearchResult[]> => {
      const langId = input.language === 'ar' ? AR_LANG_ID : EN_LANG_ID;
      const key = `${langId}:${input.query.toLowerCase()}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

      const url = `${API}/ingredient/?name=${encodeURIComponent(input.query)}&language=${langId}&limit=20&format=json`;
      let results: FoodSearchResult[];
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`wger ingredient search: ${res.status}`);
        const page = (await res.json()) as WgerIngredientPage;
        results = page.results.map(mapResult);
      } catch {
        // Transient network/timeout error — the frontend falls back to manual
        // entry on an empty/failed result rather than surfacing a hard error.
        return [];
      }

      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), results });
      return results;
    }),
});
