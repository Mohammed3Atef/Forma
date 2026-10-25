import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { EDB_CREDIT, loadCatalog, servedFoodImage, servedMedia, TAXONOMY_LABELS, type ExerciseEntry } from '../../catalog/_lib/dataset.js';
import { search } from '../../catalog/_lib/search.js';
import { FoodCategoryIdSchema, type CatalogExercise, type CatalogFood } from '../../catalog/_lib/schemas.js';
import { LICENSES } from '../../catalog/_lib/taxonomy.js';

/**
 * B4 — the curated Forma catalog (exercises + foods), read-only, over the published items of the
 * versioned dataset (`api/catalog/_lib/dataset.ts`): no database read, results capped at 50, so a
 * session never downloads the whole catalog. Any active account may read it (coaches open items;
 * clients log custom foods with the food search). B4.3: always on — it is the shared library, and
 * the coach's exercise / food LISTS are `library.ts` (the catalog merged with their own items).
 */

/** The credit an ExerciseDB demonstration and its record carry (AscendAPI attribution is required). */
const EDB_ATTRIBUTION = { provider: 'exercisedb' as const, author: EDB_CREDIT.author, url: EDB_CREDIT.sourcePage };

/**
 * The full item as a reader receives it (one shape for both origins): only the media servable now
 * (`servedMedia`); what an ExerciseDB record does not have is null, never invented — no difficulty or
 * pattern, English steps only (`instructions.ar` null: the reader sees the English, labelled).
 */
function exerciseFull(e: ExerciseEntry) {
  const base = { id: e.id, rev: e.rev, name: e.name, aliases: e.aliases, bodyPart: e.bodyPart, primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles, equipment: e.equipment, media: servedMedia(e) };
  if (e.origin === 'forma') {
    return {
      ...base,
      origin: 'forma' as const,
      pattern: e.pattern as CatalogExercise['pattern'] | null,
      mechanics: e.mechanics as CatalogExercise['mechanics'] | null,
      difficulty: e.difficulty as CatalogExercise['difficulty'] | null,
      laterality: e.laterality as CatalogExercise['laterality'] | null,
      instructions: e.instructions as { en: CatalogExercise['instructions']['en']; ar: CatalogExercise['instructions']['ar'] | null },
      variantOf: e.variantOf ?? null,
      sourceIds: e.edb.flatMap((x) => x.sourceIds),
      credit: e.edb.length ? EDB_ATTRIBUTION : null,
      translation: e.content.translation as 'draft' | 'native-reviewed' | 'missing',
    };
  }
  return {
    ...base,
    origin: 'exercisedb' as const,
    pattern: null,
    mechanics: null,
    difficulty: null,
    laterality: null,
    instructions: { en: { setup: [], steps: e.instructions.en, cues: [], mistakes: [], safety: [] }, ar: null },
    variantOf: e.variantOf,
    sourceIds: e.sourceIds,
    credit: EDB_ATTRIBUTION,
    translation: e.translation,
  };
}
export type CatalogExerciseFull = ReturnType<typeof exerciseFull>;

export function exerciseCard(e: ExerciseEntry) {
  const served = servedMedia(e);
  const video = served.find((m) => m.kind === 'video');
  const gif = served.find((m) => m.format === 'gif');
  const img = served.find((m) => m.kind === 'image' && m.format !== 'gif');
  // A list thumbnail: a still image, else a GIF's light WebP still, else a video poster — never the
  // GIF or the video itself (they load only when the exercise is opened).
  const still = img
    ? { url: img.url, author: img.author, license: img.license }
    : gif?.thumbUrl
      ? { url: gif.thumbUrl, author: gif.author, license: gif.license }
      : video?.posterUrl
        ? { url: video.posterUrl, author: video.author, license: video.license }
        : null;
  return {
    id: e.id,
    origin: e.origin,
    rev: e.rev,
    name: e.name,
    bodyPart: e.bodyPart,
    primaryMuscles: e.primaryMuscles,
    equipment: e.equipment,
    pattern: e.origin === 'forma' ? e.pattern : null,
    difficulty: e.origin === 'forma' ? e.difficulty : null,
    media: video ? ('video' as const) : gif ? ('animation' as const) : img ? ('image' as const) : ('none' as const),
    videoCount: served.filter((m) => m.kind === 'video').length,
    /** Demonstrations a reader can switch between (videos and GIFs). */
    demoCount: served.filter((m) => m.kind === 'video' || m.format === 'gif').length,
    variantOf: e.variantOf ?? null,
    thumb: still,
  };
}

export type CatalogExerciseCard = ReturnType<typeof exerciseCard>;

export function foodCard(f: CatalogFood) {
  return {
    id: f.id,
    rev: f.rev,
    name: f.name,
    category: f.category,
    state: f.state,
    per100g: f.per100g,
    portions: f.portions.map((p) => ({ id: p.id, label: p.label, grams: p.grams })),
    verification: f.verification,
    matchNote: f.matchNote ?? null,
    /** What a recipe estimate assumes (plate, oil …) — shown with the serving like a proxy's match note. */
    recipeNote: f.recipe?.note ?? null,
    /** B4.1: the approved picture (light variants on the catalog CDN, with its credit), or null. */
    image: servedFoodImage(f),
  };
}

/** The full food as a reader receives it: the servable picture only, never the image records. */
const foodFull = ({ images: _images, ...f }: CatalogFood) => ({ ...f, image: servedFoodImage({ ...f, images: _images }) });
export type CatalogFoodCard = ReturnType<typeof foodCard>;

const Query = z.string().trim().max(80).default('');
const Page = { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(2000).default(0) };

export const catalogRouter = router({
  /** Whether the catalog is on here, its dataset versions and the vocabulary labels (static; cache it). */
  meta: protectedProcedure.query(() => {
    const c = loadCatalog();
    return {
      exercises: { version: c.edb ? `${c.exercises.version}+${c.edb.version}` : c.exercises.version, count: c.exerciseCount },
      exercisedb: c.edb ? { version: c.edb.version, attribution: c.edb.source.attribution } : null,
      foods: { version: c.foods.version, count: c.foodById.size },
      taxonomy: TAXONOMY_LABELS,
      licenses: LICENSES,
      sources: { exercises: c.exercises.sources, foods: c.foods.sources },
    };
  }),

  exercises: router({
    get: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(80) })).query(({ input }) => {
      const e = loadCatalog().exerciseById.get(input.id);
      if (!e) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such catalog exercise' });
      return exerciseFull(e);
    }),
    /** Full items for known ids — picking several into a plan at once; unknown ids are absent. */
    full: protectedProcedure.input(z.object({ ids: z.array(z.string().trim().min(1).max(80)).max(30) })).query(({ input }) => {
      const c = loadCatalog();
      return input.ids.flatMap((id) => {
        const e = c.exerciseById.get(id);
        return e ? [exerciseFull(e)] : [];
      }).filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i);
    }),
  }),

  foods: router({
    search: protectedProcedure.input(z.object({ q: Query, category: FoodCategoryIdSchema.optional(), ...Page })).query(({ input }) => {
      const c = loadCatalog();
      const { hits, total } = search(c.foodIndex, input.q, { limit: input.limit, offset: input.offset, filter: (f) => !input.category || f.category === input.category });
      return { total, items: hits.map((h) => foodCard(h.item)), version: c.foods.version };
    }),
    get: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(80) })).query(({ input }) => {
      const f = loadCatalog().foodById.get(input.id);
      if (!f) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such catalog food' });
      return foodFull(f);
    }),
  }),
});
