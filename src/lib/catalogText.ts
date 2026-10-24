import type { Exercise, FoodItem, FoodProvenance } from '@/types';

/**
 * B4 — the light catalog helpers every reader screen needs: a plan exercise's display name, a
 * serving in the reader's language, and which fields carry a food row's provenance. Kept apart from
 * `catalogCopy` (which builds plan copies of catalog items) so lists and editors don't load it.
 */

/**
 * The name to show for a plan exercise: a catalog copy in the reader's language — unless the coach
 * renamed it in the plan (`name` no longer the catalog's English name), then the coach's name.
 */
export function exerciseDisplayName(ex: Pick<Exercise, 'name' | 'names'>, lang: string): string {
  if (!ex.names || ex.name.trim() !== ex.names.en.trim()) return ex.name;
  return lang.startsWith('ar') ? ex.names.ar || ex.name : ex.name;
}

/** A serving in the reader's language, always with its grams: "1 cup (158 g)", "1.5 × 1 cup (237 g)", "150 g". */
export function servingText(portion: FoodProvenance['portion'], lang: string): string {
  if (!portion) return '';
  const ar = lang.startsWith('ar');
  const grams = `${formatAmount(portion.grams)} ${ar ? 'جم' : 'g'}`;
  if (portion.id === 'g' || !portion.label) return grams;
  const label = ar ? portion.label.ar || portion.label.en : portion.label.en;
  return portion.amount === 1 ? `${label} (${grams})` : `${formatAmount(portion.amount)} × ${label} (${grams})`;
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** The provenance keys a food row can carry (cleared together when values are typed by hand). */
export const PROVENANCE_KEYS = ['catalogId', 'catalogRev', 'per100g', 'portion', 'foodState', 'verification', 'sourceNote', 'source'] as const satisfies readonly (keyof FoodItem)[];

/** The provenance a stored food row carries (null when its values were typed by hand). */
export function provenanceOf(f: Partial<FoodItem>): FoodProvenance | null {
  const out: Record<string, unknown> = {};
  for (const k of PROVENANCE_KEYS) if (f[k] !== undefined) out[k] = f[k];
  return Object.keys(out).length ? (out as FoodProvenance) : null;
}

/** True when the row's numbers are a labelled estimate (recipe / nearest match). */
export const isEstimate = (f: Pick<FoodItem, 'verification'>): boolean => f.verification === 'recipe-estimate' || f.verification === 'proxy-estimate';
