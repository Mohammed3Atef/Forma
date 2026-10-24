import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { CommercialReason } from '../../_lib/commercialReason.js';
import { catalogEnabled, loadCatalog, servedFoodImage, servedMedia, TAXONOMY_LABELS } from '../../catalog/_lib/dataset.js';
import { search } from '../../catalog/_lib/search.js';
import { BodyPartIdSchema, DifficultyIdSchema, EquipmentIdSchema, FoodCategoryIdSchema, MuscleIdSchema, PatternIdSchema, type CatalogExercise, type CatalogFood } from '../../catalog/_lib/schemas.js';
import { LICENSES } from '../../catalog/_lib/taxonomy.js';

/**
 * B4 — the curated Forma catalog (exercises + foods), read-only. Search runs in memory on the
 * server over the published items of the versioned dataset (`api/catalog/_lib/dataset.ts`): no
 * database read, results capped at 50, so a session never downloads the whole catalog. Any
 * active account may search (coaches build plans; clients log custom foods). Off in production
 * until the owner switches it on — refused with CATALOG_DISABLED.
 */
function assertEnabled(): void {
  if (!catalogEnabled()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The Forma catalog is not enabled', cause: new CommercialReason('CATALOG_DISABLED') });
}

/** The full item as a reader receives it: only the media servable now (B4.1 — `servedMedia`). */
const exerciseFull = (e: CatalogExercise) => ({ ...e, media: servedMedia(e) });

export function exerciseCard(e: CatalogExercise) {
  const served = servedMedia(e);
  const img = served.find((m) => m.kind === 'image');
  const video = served.find((m) => m.kind === 'video');
  // A list thumbnail: a still image, else the primary video's poster — never the video itself.
  const still = img ? { url: img.url, author: img.author, license: img.license } : video?.posterUrl ? { url: video.posterUrl, author: video.author, license: video.license } : null;
  return {
    id: e.id,
    rev: e.rev,
    name: e.name,
    bodyPart: e.bodyPart,
    primaryMuscles: e.primaryMuscles,
    equipment: e.equipment,
    pattern: e.pattern,
    difficulty: e.difficulty,
    media: video ? ('video' as const) : img ? ('image' as const) : ('none' as const),
    videoCount: served.filter((m) => m.kind === 'video').length,
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
const Page = { limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).max(1000).default(0) };

export const catalogRouter = router({
  /** Whether the catalog is on here, its dataset versions and the vocabulary labels (static; cache it). */
  meta: protectedProcedure.query(() => {
    if (!catalogEnabled()) return { enabled: false as const };
    const c = loadCatalog();
    return {
      enabled: true as const,
      exercises: { version: c.exercises.version, count: c.exerciseById.size },
      foods: { version: c.foods.version, count: c.foodById.size },
      taxonomy: TAXONOMY_LABELS,
      licenses: LICENSES,
      sources: { exercises: c.exercises.sources, foods: c.foods.sources },
    };
  }),

  exercises: router({
    search: protectedProcedure
      .input(
        z.object({
          q: Query,
          muscle: MuscleIdSchema.optional(),
          equipment: EquipmentIdSchema.optional(),
          pattern: PatternIdSchema.optional(),
          bodyPart: BodyPartIdSchema.optional(),
          difficulty: DifficultyIdSchema.optional(),
          video: z.boolean().optional(),
          ...Page,
        }),
      )
      .query(({ input }) => {
        assertEnabled();
        const c = loadCatalog();
        const { hits, total } = search(c.exerciseIndex, input.q, {
          limit: input.limit,
          offset: input.offset,
          filter: (e) =>
            (!input.muscle || e.primaryMuscles.includes(input.muscle) || e.secondaryMuscles.includes(input.muscle)) &&
            (!input.equipment || e.equipment.includes(input.equipment)) &&
            (!input.pattern || e.pattern === input.pattern) &&
            (!input.bodyPart || e.bodyPart === input.bodyPart) &&
            (!input.difficulty || e.difficulty === input.difficulty) &&
            (!input.video || servedMedia(e).some((m) => m.kind === 'video')),
        });
        return { total, items: hits.map((h) => exerciseCard(h.item)), version: c.exercises.version };
      }),
    get: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(80) })).query(({ input }) => {
      assertEnabled();
      const e = loadCatalog().exerciseById.get(input.id);
      if (!e) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such catalog exercise' });
      return exerciseFull(e);
    }),
    /** Full items for known ids — picking several into a plan at once; unknown ids are absent. */
    full: protectedProcedure.input(z.object({ ids: z.array(z.string().trim().min(1).max(80)).max(30) })).query(({ input }) => {
      assertEnabled();
      const c = loadCatalog();
      return input.ids.flatMap((id) => {
        const e = c.exerciseById.get(id);
        return e ? [exerciseFull(e)] : [];
      });
    }),
    /** Cards for known ids (recently used); unknown or unpublished ids are simply absent. */
    byIds: protectedProcedure.input(z.object({ ids: z.array(z.string().trim().min(1).max(80)).max(50) })).query(({ input }) => {
      assertEnabled();
      const c = loadCatalog();
      return input.ids.flatMap((id) => {
        const e = c.exerciseById.get(id);
        return e ? [exerciseCard(e)] : [];
      });
    }),
  }),

  foods: router({
    search: protectedProcedure.input(z.object({ q: Query, category: FoodCategoryIdSchema.optional(), ...Page })).query(({ input }) => {
      assertEnabled();
      const c = loadCatalog();
      const { hits, total } = search(c.foodIndex, input.q, { limit: input.limit, offset: input.offset, filter: (f) => !input.category || f.category === input.category });
      return { total, items: hits.map((h) => foodCard(h.item)), version: c.foods.version };
    }),
    get: protectedProcedure.input(z.object({ id: z.string().trim().min(1).max(80) })).query(({ input }) => {
      assertEnabled();
      const f = loadCatalog().foodById.get(input.id);
      if (!f) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such catalog food' });
      return foodFull(f);
    }),
  }),
});
