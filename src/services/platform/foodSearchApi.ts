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

// Servings are computed with the shared rule in `lib/catalogNutrition` (B4 / FD-11).
