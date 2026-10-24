import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_PARTS, DIFFICULTY, EQUIPMENT, FOOD_CATEGORIES, FOOD_STATES, MUSCLES, PATTERNS } from './taxonomy.js';
import { buildIndex, type SearchIndex } from './search.js';
import type { CatalogExercise, CatalogFood, CatalogFoodImage, CatalogMedia, ExerciseDataset, FoodDataset } from './schemas.js';

/**
 * B4 — the curated catalog, served from versioned dataset files committed under `data/catalog/`
 * (built by `scripts/catalog/build-*.mjs`, validated by `dataset.test.ts`). Read off disk once per
 * warm instance (static module-relative path, so Vercel's file trace bundles the files — the same
 * pattern as `coach-assets/_lib/exerciseLibrary.ts`) and searched in memory: no database read, no
 * index, nothing written. Coach-created exercises and foods stay in their own collections.
 *
 * Production switch: the catalog is OFF in production until the owner sets `FORMA_CATALOG=on`
 * (B4 approval gate — shipping the code is not switching the data). Everywhere else it is on
 * unless `FORMA_CATALOG=off`.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data/catalog');

type Env = Partial<Record<'FORMA_CATALOG' | 'VERCEL_ENV' | 'NODE_ENV', string>>;

export function catalogEnabled(env: Env = process.env as Env): boolean {
  const flag = env.FORMA_CATALOG?.trim().toLowerCase();
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  const prod = env.VERCEL_ENV ? env.VERCEL_ENV === 'production' : false;
  return !prod;
}

interface Loaded {
  exercises: ExerciseDataset;
  foods: FoodDataset;
  exerciseIndex: SearchIndex<CatalogExercise>;
  foodIndex: SearchIndex<CatalogFood>;
  exerciseById: Map<string, CatalogExercise>;
  foodById: Map<string, CatalogFood>;
}

let cache: Loaded | null = null;

const label = <T extends Record<string, { en: string; ar: string }>>(table: T, id: string) => table[id as keyof T];

export function exerciseSearchFields(e: CatalogExercise) {
  const lbl = (t: { en: string; ar: string } | undefined) => (t ? [t.en, t.ar] : []);
  return [
    { text: e.name.en, weight: 1 },
    { text: e.name.ar, weight: 1 },
    ...e.aliases.en.map((text) => ({ text, weight: 0.9 })),
    ...e.aliases.ar.map((text) => ({ text, weight: 0.9 })),
    ...e.aliases.eg.map((text) => ({ text, weight: 0.9 })),
    ...[...e.primaryMuscles.flatMap((m) => lbl(label(MUSCLES, m))), ...e.equipment.flatMap((q) => lbl(label(EQUIPMENT, q)))].map((text) => ({ text, weight: 0.45 })),
    ...[...e.secondaryMuscles.flatMap((m) => lbl(label(MUSCLES, m))), ...lbl(label(PATTERNS, e.pattern)), ...lbl(label(BODY_PARTS, e.bodyPart))].map((text) => ({ text, weight: 0.3 })),
  ];
}

export function foodSearchFields(f: CatalogFood) {
  const lbl = (t: { en: string; ar: string } | undefined) => (t ? [t.en, t.ar] : []);
  return [
    { text: f.name.en, weight: 1 },
    { text: f.name.ar, weight: 1 },
    ...f.aliases.en.map((text) => ({ text, weight: 0.9 })),
    ...f.aliases.ar.map((text) => ({ text, weight: 0.9 })),
    ...f.aliases.eg.map((text) => ({ text, weight: 0.9 })),
    ...[...lbl(label(FOOD_CATEGORIES, f.category)), ...lbl(label(FOOD_STATES, f.state)), ...(f.preparation ? [f.preparation.en, f.preparation.ar] : [])].map((text) => ({ text, weight: 0.35 })),
  ];
}

/** Ranking boost: a complete, demonstrated exercise / a source-verified food comes first among equals. */
const exerciseBoost = (e: CatalogExercise) => {
  const live = e.media.filter((m) => m.publication === 'published');
  return live.some((m) => m.kind === 'video') ? 0.15 : live.length ? 0.1 : 0;
};

/**
 * B4.1 — Forma's PUBLIC catalog CDN, where the owner re-hosts approved demonstration files (never
 * private client media). Unset: only media still served from its source is shown; the Forma-hosted
 * files appear once this is configured. https only (loopback http for the isolated test stack).
 */
export function catalogMediaBase(env: Partial<Record<'FORMA_CATALOG_MEDIA_URL', string>> = process.env as Record<string, string>): string | null {
  const v = env.FORMA_CATALOG_MEDIA_URL?.trim().replace(/\/+$/, '');
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))) return v;
  } catch {
    /* not a URL — treated as unset */
  }
  return null;
}

/** B4.1 — the picture of a catalog food a reader may see now (null: none approved, or the CDN not set). */
export interface ServedFoodImage {
  thumbUrl: string;
  cardUrl: string;
  width: number;
  height: number;
  alt: { en: string; ar: string };
  author: string;
  license: CatalogFoodImage['license'];
  licenseUrl: string | null;
  sourcePage: string;
  /** The picture's own revision: a replaced catalog picture is a new file, so saved plans keep theirs. */
  rev: number;
}
export function servedFoodImage(f: CatalogFood, base: string | null = catalogMediaBase()): ServedFoodImage | null {
  if (!base) return null;
  const live = (f.images ?? []).filter((i) => i.publication === 'published' && i.rights === 'verified' && i.review !== 'pending');
  const i = live.find((x) => x.role === 'primary') ?? live[0];
  if (!i) return null;
  return {
    thumbUrl: `${base}/${i.variants.thumb.cdnPath}`,
    cardUrl: `${base}/${i.variants.card.cdnPath}`,
    width: i.variants.card.width,
    height: i.variants.card.height,
    alt: i.alt,
    author: i.author,
    license: i.license,
    licenseUrl: i.licenseUrl ?? null,
    sourcePage: i.sourcePage,
    rev: i.rev,
  };
}

export type ServedMedia = CatalogMedia & { posterUrl: string | null };

/**
 * The demonstrations a reader may see now, primary first within each kind: published, rights
 * verified, approved by a person — and, for a Forma-hosted file, only once the catalog CDN is set
 * (its `url` is then the CDN address; otherwise `url` is the original file at its source).
 */
export function servedMedia(e: CatalogExercise, base: string | null = catalogMediaBase()): ServedMedia[] {
  const out: ServedMedia[] = [];
  for (const m of e.media) {
    if (m.publication !== 'published' || m.rights !== 'verified' || m.review !== 'approved') continue;
    const posterUrl = m.poster && base ? `${base}/${m.poster.cdnPath}` : null;
    if (m.hosting === 'forma-cdn') {
      if (base && m.cdnPath) out.push({ ...m, url: `${base}/${m.cdnPath}`, posterUrl });
    } else out.push({ ...m, posterUrl });
  }
  const rank = (m: ServedMedia) => (m.role === 'primary' ? 0 : 1);
  return [...out.filter((m) => m.kind === 'video').sort((a, b) => rank(a) - rank(b)), ...out.filter((m) => m.kind === 'image').sort((a, b) => rank(a) - rank(b))];
}
const foodBoost = (f: CatalogFood) => (f.verification === 'source-values' ? 0.2 : 0);

export function indexDatasets(exercises: ExerciseDataset, foods: FoodDataset): Loaded {
  const pubEx = exercises.items.filter((e) => e.status === 'published');
  const pubFood = foods.items.filter((f) => f.status === 'published');
  return {
    exercises,
    foods,
    exerciseIndex: buildIndex(pubEx, exerciseSearchFields, { boost: exerciseBoost, sortKey: (e) => e.name.en }),
    foodIndex: buildIndex(pubFood, foodSearchFields, { boost: foodBoost, sortKey: (f) => f.name.en }),
    exerciseById: new Map(pubEx.map((e) => [e.id, e])),
    foodById: new Map(pubFood.map((f) => [f.id, f])),
  };
}

export function loadCatalog(): Loaded {
  if (cache) return cache;
  const exercises = JSON.parse(readFileSync(join(DATA_DIR, 'exercises.json'), 'utf-8')) as ExerciseDataset;
  const foods = JSON.parse(readFileSync(join(DATA_DIR, 'foods.json'), 'utf-8')) as FoodDataset;
  cache = indexDatasets(exercises, foods);
  return cache;
}

/** Test hook. */
export function setCatalogForTests(loaded: Loaded | null): void {
  cache = loaded;
}

export const TAXONOMY_LABELS = { muscles: MUSCLES, equipment: EQUIPMENT, patterns: PATTERNS, bodyParts: BODY_PARTS, difficulty: DIFFICULTY, foodCategories: FOOD_CATEGORIES, foodStates: FOOD_STATES };
