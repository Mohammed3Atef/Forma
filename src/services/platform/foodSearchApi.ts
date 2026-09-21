import { trpc } from '@/services/trpc';

/**
 * Live proxy search against wger.de's public ingredient database — a third
 * option alongside "type manually" / "pick from your library" in the food
 * entry flows (`CoachNutritionEditor.tsx`, `Nutrition.tsx`). See
 * `api/_trpc/routers/foodSearch.ts` for the backend side (caching, mapping,
 * the open licensing question that needs verifying before production).
 */
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
  sourceNutrition: { baseGrams: number; calories: number; protein: number; carbs: number; fats: number };
}

export async function searchFoods(query: string, language?: 'en' | 'ar'): Promise<FoodSearchResult[]> {
  return trpc.foodSearch.search.query({ query, language }) as Promise<FoodSearchResult[]>;
}

/** `sourceValue * servingGrams / baseGrams`, rounded for display only — never fed back into `sourceNutrition` itself. */
export function scaleNutrition(base: FoodSearchResult['sourceNutrition'], servingGrams: number): { calories: number; protein: number; carbs: number; fats: number } {
  const factor = servingGrams / base.baseGrams;
  const round1 = (n: number) => Math.round(n * factor * 10) / 10;
  return { calories: Math.round(base.calories * factor), protein: round1(base.protein), carbs: round1(base.carbs), fats: round1(base.fats) };
}
