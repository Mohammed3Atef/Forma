import { getCatalogFood, type CatalogFood, type CatalogFoodCard } from '@/services/platform/catalogApi';
import { getFood } from '@/services/platform/coachAssetsApi';
import type { FoodPick } from './catalogCopy';
import type { LibraryFood } from '@/types';

/**
 * B4.3 — reading one library food for a plan (Library › Foods and the nutrition editor's hand-off):
 * a Forma catalog food by its `ff_…` id, or the coach's own food. The plan item itself is made by
 * `foodHandoff` (pure).
 */

/** Forma catalog food ids. */
export const isCatalogFoodId = (id: string): boolean => id.startsWith('ff_');

/** A full catalog food in the shape a list card has (what the serving and copy helpers take). */
export const catalogFoodCard = (f: CatalogFood): CatalogFoodCard => ({ id: f.id, rev: f.rev, name: f.name, category: f.category, state: f.state, per100g: f.per100g, portions: f.portions.map((p) => ({ id: p.id, label: p.label, grams: p.grams })), verification: f.verification, matchNote: f.matchNote ?? null, recipeNote: f.recipe?.note ?? null, image: f.image });

/**
 * One food handed to the nutrition editor by id (`?addFood=`): the coach's own food as it is; a Forma
 * food at its first household serving (else 100 g). The coach changes the serving on the plan row
 * afterwards (its per-100 g values travel with it).
 */
export async function foodForPlan(coachId: string, id: string): Promise<{ name: LibraryFood['name']; food: LibraryFood | { pick: FoodPick } }> {
  if (!isCatalogFoodId(id)) {
    const food = await getFood(coachId, id);
    return { name: food.name, food };
  }
  const [f, { foodPickFromCatalog }] = await Promise.all([getCatalogFood(id), import('./catalogCopy')]);
  const portion = f.portions[0];
  const pick = foodPickFromCatalog(catalogFoodCard(f), portion?.id ?? 'g', portion ? 1 : 100);
  return { name: pick.name, food: { pick } };
}
