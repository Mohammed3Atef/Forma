import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BODY_PARTS, DIFFICULTY, EQUIPMENT, FOOD_CATEGORIES, FOOD_STATES, MUSCLES, PATTERNS } from './taxonomy.js';
import { buildIndex, type SearchIndex } from './search.js';
import type { CatalogExercise, CatalogFood, CatalogFoodImage, CatalogMedia, EdbDataset, EdbExercise, ExerciseDataset, FoodDataset } from './schemas.js';

/**
 * B4 — the curated catalog, served from versioned dataset files committed under `data/catalog/`
 * (built by `scripts/catalog/build-*.mjs`, validated by `dataset.test.ts`). Read off disk once per
 * warm instance (static module-relative path, so Vercel's file trace bundles the files — the same
 * pattern as `coach-assets/_lib/exerciseLibrary.ts`) and searched in memory: no database read, no
 * index, nothing written. Coach-created exercises and foods stay in their own collections.
 *
 * B4.3: the catalog IS the shared library every coach uses (`api/_trpc/routers/library.ts`) — the
 * B4 `FORMA_CATALOG` switch is retired; there is no library without it.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../../data/catalog');

/**
 * B4.2 — one catalog exercise as search and the API see it: a curated Forma item (with the
 * ExerciseDB demonstrations of the same movement linked to it, `edb`), or an ExerciseDB item.
 */
export type FormaEntry = CatalogExercise & { origin: 'forma'; edb: EdbExercise[] };
export type EdbEntry = EdbExercise & { origin: 'exercisedb'; status: 'published'; rev: 1 };
export type ExerciseEntry = FormaEntry | EdbEntry;

interface Loaded {
  exercises: ExerciseDataset;
  foods: FoodDataset;
  /** The ExerciseDB layer (null when the dataset file is absent). */
  edb: EdbDataset | null;
  exerciseIndex: SearchIndex<ExerciseEntry>;
  foodIndex: SearchIndex<CatalogFood>;
  /** Every id a reader may hold — curated ids, ExerciseDB ids, and an ExerciseDB id linked to a curated item resolves to that item. */
  exerciseById: Map<string, ExerciseEntry>;
  /** The distinct exercises (what the catalog counts). */
  exerciseCount: number;
  foodById: Map<string, CatalogFood>;
}

let cache: Loaded | null = null;

const label = <T extends Record<string, { en: string; ar: string }>>(table: T, id: string) => table[id as keyof T];

export function exerciseSearchFields(e: CatalogExercise | ExerciseEntry) {
  const lbl = (t: { en: string; ar: string } | undefined) => (t ? [t.en, t.ar] : []);
  // A curated item also answers to the ExerciseDB names of the same movement (B4.2).
  const linked = 'edb' in e ? e.edb : [];
  return [
    { text: e.name.en, weight: 1 },
    { text: e.name.ar, weight: 1 },
    ...e.aliases.en.map((text) => ({ text, weight: 0.9 })),
    ...e.aliases.ar.map((text) => ({ text, weight: 0.9 })),
    ...e.aliases.eg.map((text) => ({ text, weight: 0.9 })),
    ...linked.flatMap((x) => [x.name.en, x.name.ar, ...x.aliases.eg]).map((text) => ({ text, weight: 0.85 })),
    ...[...e.primaryMuscles.flatMap((m) => lbl(label(MUSCLES, m))), ...e.equipment.flatMap((q) => lbl(label(EQUIPMENT, q)))].map((text) => ({ text, weight: 0.45 })),
    ...[...e.secondaryMuscles.flatMap((m) => lbl(label(MUSCLES, m))), ...('pattern' in e ? lbl(label(PATTERNS, e.pattern)) : []), ...lbl(label(BODY_PARTS, e.bodyPart))].map((text) => ({ text, weight: 0.3 })),
  ].filter((f) => f.text.trim());
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

/**
 * Ranking boost among equals: a curated Forma item (reviewed bilingual instructions) first, then a
 * demonstrated one (video, then a GIF or image); a source-verified food first.
 */
const exerciseBoost = (e: ExerciseEntry) => {
  if (e.origin === 'exercisedb') return e.media.length ? 0.05 : 0;
  const live = e.media.filter((m) => m.publication === 'published');
  return 0.2 + (live.some((m) => m.kind === 'video') ? 0.15 : live.length || e.edb.some((x) => x.media.length) ? 0.1 : 0);
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
/**
 * The light variants on Forma's catalog CDN once it is configured; until then (B4.2) Wikimedia's own
 * renditions of the same reviewed file — so a food shows its picture with nothing uploaded.
 */
export function servedFoodImage(f: CatalogFood, base: string | null = catalogMediaBase()): ServedFoodImage | null {
  const live = (f.images ?? []).filter((i) => i.publication === 'published' && i.rights === 'verified' && i.review !== 'pending' && (base || i.remote));
  const i = live.find((x) => x.role === 'primary') ?? live[0];
  if (!i) return null;
  const urls = base ? { thumbUrl: `${base}/${i.variants.thumb.cdnPath}`, cardUrl: `${base}/${i.variants.card.cdnPath}` } : { thumbUrl: i.remote!.thumbUrl, cardUrl: i.remote!.cardUrl };
  const size = base ? { width: i.variants.card.width, height: i.variants.card.height } : { width: Math.min(500, i.remote!.width), height: Math.round((Math.min(500, i.remote!.width) / i.remote!.width) * i.remote!.height) };
  return {
    ...urls,
    ...size,
    alt: i.alt,
    author: i.author,
    license: i.license,
    licenseUrl: i.licenseUrl ?? null,
    sourcePage: i.sourcePage,
    rev: i.rev,
  };
}

/** A demonstration as a reader receives it. `thumbUrl`: a light still for lists (ExerciseDB GIFs). */
export type ServedMedia = Omit<CatalogMedia, 'license' | 'source'> & {
  license: CatalogMedia['license'] | 'EXERCISEDB';
  source: { provider: 'wger' | 'exercisedb'; id: string };
  posterUrl: string | null;
  thumbUrl: string | null;
};

/** The credit every ExerciseDB demonstration carries (the provider requires attribution to AscendAPI). */
export const EDB_CREDIT = { author: 'ExerciseDB (AscendAPI)', sourcePage: 'https://ascendapi.com' } as const;

/** ExerciseDB GIFs, served from their original address; the list still is the app's own WebP. */
function edbMedia(items: EdbExercise[], role?: 'alternate'): ServedMedia[] {
  return items.flatMap((x) =>
    x.media.map((m) => ({
      id: m.id,
      kind: 'image' as const,
      url: m.url,
      hosting: 'source' as const,
      role: role ?? m.role,
      format: 'gif' as const,
      mime: 'image/gif' as const,
      width: m.width,
      height: m.height,
      bytes: m.bytes,
      license: 'EXERCISEDB' as const,
      author: EDB_CREDIT.author,
      sourcePage: EDB_CREDIT.sourcePage,
      source: { provider: 'exercisedb' as const, id: m.sourceId },
      verified: 'source-link' as const,
      rights: 'verified' as const,
      review: 'approved' as const,
      publication: 'published' as const,
      posterUrl: m.thumb,
      thumbUrl: m.thumb,
    })),
  );
}

/**
 * The demonstrations a reader may see now, primary first within each kind: published, rights
 * verified, approved by a person — and, for a Forma-hosted file, only once the catalog CDN is set
 * (its `url` is then the CDN address; otherwise `url` is the original file at its source).
 */
export function servedMedia(e: CatalogExercise | ExerciseEntry, base: string | null = catalogMediaBase()): ServedMedia[] {
  if ('origin' in e && e.origin === 'exercisedb') return edbMedia([e]);
  const out: ServedMedia[] = [];
  for (const m of e.media) {
    if (m.publication !== 'published' || m.rights !== 'verified' || m.review !== 'approved') continue;
    const posterUrl = m.poster && base ? `${base}/${m.poster.cdnPath}` : null;
    if (m.hosting === 'forma-cdn') {
      if (base && m.cdnPath) out.push({ ...m, url: `${base}/${m.cdnPath}`, posterUrl, thumbUrl: posterUrl });
    } else out.push({ ...m, posterUrl, thumbUrl: null });
  }
  const rank = (m: ServedMedia) => (m.role === 'primary' ? 0 : 1);
  // Videos first, then the linked ExerciseDB GIFs (a moving demonstration), then still images.
  const linked = 'edb' in e ? edbMedia(e.edb, out.length ? 'alternate' : undefined) : [];
  return [...out.filter((m) => m.kind === 'video').sort((a, b) => rank(a) - rank(b)), ...linked, ...out.filter((m) => m.kind === 'image').sort((a, b) => rank(a) - rank(b))];
}
const foodBoost = (f: CatalogFood) => (f.verification === 'source-values' ? 0.2 : 0);

export function indexDatasets(exercises: ExerciseDataset, foods: FoodDataset, edb: EdbDataset | null = null): Loaded {
  const pubFood = foods.items.filter((f) => f.status === 'published');
  const linkedTo = new Map<string, EdbExercise[]>();
  for (const x of edb?.items ?? []) if (x.formaId) (linkedTo.get(x.formaId) ?? linkedTo.set(x.formaId, []).get(x.formaId)!).push(x);
  const forma: FormaEntry[] = exercises.items.filter((e) => e.status === 'published').map((e) => ({ ...e, origin: 'forma' as const, edb: linkedTo.get(e.id) ?? [] }));
  const formaById = new Map(forma.map((e) => [e.id, e]));
  // A link to a curated item that is not published here keeps the ExerciseDB item standalone.
  const standalone: EdbEntry[] = (edb?.items ?? []).filter((x) => !x.formaId || !formaById.has(x.formaId)).map((x) => ({ ...x, origin: 'exercisedb' as const, status: 'published' as const, rev: 1 as const }));
  const entries: ExerciseEntry[] = [...forma, ...standalone];
  const byId = new Map<string, ExerciseEntry>(entries.map((e) => [e.id, e]));
  for (const e of forma) for (const x of e.edb) byId.set(x.id, e);
  return {
    exercises,
    foods,
    edb,
    exerciseIndex: buildIndex(entries, exerciseSearchFields, { boost: exerciseBoost, sortKey: (e) => e.name.en }),
    foodIndex: buildIndex(pubFood, foodSearchFields, { boost: foodBoost, sortKey: (f) => f.name.en }),
    exerciseById: byId,
    exerciseCount: entries.length,
    foodById: new Map(pubFood.map((f) => [f.id, f])),
  };
}

export function loadCatalog(): Loaded {
  if (cache) return cache;
  const exercises = JSON.parse(readFileSync(join(DATA_DIR, 'exercises.json'), 'utf-8')) as ExerciseDataset;
  const foods = JSON.parse(readFileSync(join(DATA_DIR, 'foods.json'), 'utf-8')) as FoodDataset;
  const edbFile = join(DATA_DIR, 'exercisedb.json');
  const edb = existsSync(edbFile) ? (JSON.parse(readFileSync(edbFile, 'utf-8')) as EdbDataset) : null;
  cache = indexDatasets(exercises, foods, edb);
  return cache;
}

/** Test hook. */
export function setCatalogForTests(loaded: Loaded | null): void {
  cache = loaded;
}

export const TAXONOMY_LABELS = { muscles: MUSCLES, equipment: EQUIPMENT, patterns: PATTERNS, bodyParts: BODY_PARTS, difficulty: DIFFICULTY, foodCategories: FOOD_CATEGORIES, foodStates: FOOD_STATES };
