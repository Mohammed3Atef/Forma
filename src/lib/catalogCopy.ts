import { blankExercise } from './workoutPresets';
import { nutrientsFor, servingGrams } from './catalogNutrition';
import { servingText } from './catalogText';
import type { Exercise, FoodImageRef, FoodProvenance, LocalizedText } from '@/types';
import type { CatalogExercise, CatalogFoodCard, CatalogTaxonomy } from '@/services/platform/catalogApi';

/**
 * B4 — turning a Forma catalog item into the copy a plan stores. Plans keep full copies (history
 * stays readable whatever happens to the catalog later); the copy remembers where it came from
 * (`catalogId` + revision) and everything a reader needs: bilingual name, structured instructions,
 * media with its credits — and, for a food, the per-100 g values and the serving its numbers were
 * computed from, so a later amount change recomputes instead of guessing.
 *
 * The light helpers every screen needs (display names, serving text, provenance keys) live in
 * `catalogText`, so the copy machinery loads only where a catalog item is actually copied.
 */
export { exerciseDisplayName, isEstimate, PROVENANCE_KEYS, provenanceOf, servingText } from './catalogText';

const en = <T extends Record<string, { en: string; ar: string }>>(table: T, id: string): string => (table as Record<string, { en: string }>)[id]?.en ?? id;

/** A plan exercise copied from the catalog: fresh id, default programming, catalog identity and media. */
export function exerciseFromCatalog(e: CatalogExercise, taxonomy: CatalogTaxonomy): Exercise {
  // The media a reader may see now (the server sends only that — B4.1 `servedMedia`), primary first.
  const images = e.media.filter((m) => m.kind === 'image');
  const video = e.media.find((m) => m.kind === 'video');
  const equipment = e.equipment.map((q) => en(taxonomy.equipment, q));
  return {
    ...blankExercise(),
    name: e.name.en,
    names: { en: e.name.en, ar: e.name.ar },
    // English labels, as every existing view expects ("Chest", "Lats" …); the reader's language
    // comes from `muscleLabel` / the taxonomy.
    targetMuscle: en(taxonomy.muscles, e.primaryMuscles[0]),
    category: en(taxonomy.bodyParts, e.bodyPart),
    equipment: equipment.join(', '),
    equipmentList: equipment,
    muscles: e.primaryMuscles.map((m) => en(taxonomy.muscles, m)),
    secondaryMuscles: e.secondaryMuscles.map((m) => en(taxonomy.muscles, m)),
    imageUrl: images[0]?.url ?? null,
    images: images.map((m) => m.url),
    videoUrl: video?.url ?? null,
    videoPosterUrl: video?.posterUrl ?? null,
    mediaCredits: e.media.map((m) => ({ url: m.url, kind: m.kind, author: m.author, license: m.license, sourcePage: m.sourcePage })),
    instructions: e.instructions,
    catalogId: e.id,
    catalogRev: e.rev,
  };
}

export interface FoodPick {
  name: LocalizedText;
  /** English text kept in the legacy `quantity` field (older apps read it). */
  quantity: string;
  macros: { calories: number; protein: number; carbs: number; fats: number };
  provenance: FoodProvenance;
  /** B4.1: the food's approved Forma picture, copied into the plan (null when it has none). */
  image: FoodImageRef | null;
}

/** A catalog food's served picture as the copy a plan or library food keeps. */
export function foodImageFromCatalog(foodId: string, img: CatalogFoodCard['image']): FoodImageRef | null {
  if (!img) return null;
  return { source: 'forma-catalog', catalogFoodId: foodId, url: img.cardUrl, thumbUrl: img.thumbUrl, width: img.width, height: img.height, alt: img.alt, author: img.author, license: img.license, sourcePage: img.sourcePage, rev: img.rev, uploadedAt: Date.now() };
}

const SOURCE: Record<CatalogFoodCard['verification'], NonNullable<FoodProvenance['source']>> = {
  'source-values': { provider: 'forma-catalog', license: 'CC0-1.0', attribution: 'Source: USDA FoodData Central (CC0); names and portions by Forma' },
  'proxy-estimate': { provider: 'forma-catalog', license: 'CC0-1.0', attribution: 'Estimate from the nearest USDA FoodData Central record (CC0), matched by Forma' },
  'recipe-estimate': { provider: 'forma-catalog', license: 'FORMA-PROPRIETARY', attribution: 'Forma recipe estimate from USDA FoodData Central ingredients (CC0)' },
};

/**
 * A serving of a catalog food: `portionId` is one of the food's portions, or `'g'` for plain grams.
 * Values are computed once, from per-100 g × grams (`catalogNutrition`), never typed.
 */
export function foodPickFromCatalog(f: Pick<CatalogFoodCard, 'id' | 'rev' | 'name' | 'per100g' | 'portions' | 'state' | 'verification' | 'matchNote'> & { recipeNote?: CatalogFoodCard['recipeNote']; image?: CatalogFoodCard['image'] }, portionId: string, amount: number): FoodPick {
  const note = f.matchNote ?? f.recipeNote ?? null;
  const portion = portionId === 'g' ? null : f.portions.find((p) => p.id === portionId) ?? null;
  const grams = servingGrams(amount, portion);
  const n = nutrientsFor(f.per100g, grams);
  const servingPortion: NonNullable<FoodProvenance['portion']> = portion ? { id: portion.id, amount, grams, label: portion.label } : { id: 'g', amount: grams, grams };
  return {
    name: { en: f.name.en, ar: f.name.ar },
    quantity: servingText(servingPortion, 'en'),
    macros: { calories: n.kcal, protein: n.protein, carbs: n.carbs, fats: n.fat },
    provenance: {
      catalogId: f.id,
      catalogRev: f.rev,
      per100g: f.per100g,
      portion: servingPortion,
      foodState: f.state,
      verification: f.verification,
      ...(note ? { sourceNote: note } : {}),
      source: SOURCE[f.verification],
    },
    image: foodImageFromCatalog(f.id, f.image ?? null),
  };
}

/** Recompute a catalog row for a new serving of the SAME food (amount / portion change in the editor). */
export function reserve(prov: FoodProvenance, portion: { id: string; grams: number; label?: LocalizedText } | null, amount: number): Pick<FoodPick, 'quantity' | 'macros' | 'provenance'> | null {
  if (!prov.per100g) return null;
  const grams = servingGrams(amount, portion);
  const n = nutrientsFor(prov.per100g, grams);
  const servingPortion: NonNullable<FoodProvenance['portion']> = portion ? { id: portion.id, amount, grams, ...(portion.label ? { label: portion.label } : {}) } : { id: 'g', amount: grams, grams };
  return { quantity: servingText(servingPortion, 'en'), macros: { calories: n.kcal, protein: n.protein, carbs: n.carbs, fats: n.fat }, provenance: { ...prov, portion: servingPortion } };
}
