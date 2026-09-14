import type { Collection } from 'mongodb';
import { z, type ZodTypeAny } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, authedProcedure, roleProcedure } from '../trpc.js';
import { requireReadAccess } from '../../coach-assets/_lib/access.js';
import {
  coachBillingPlansCol,
  coachExercisesCol,
  coachFoodGroupsCol,
  coachFoodsCol,
  coachNutritionTemplatesCol,
  coachSupplementsCol,
  coachWorkoutTemplatesCol,
} from '../../coach-assets/_lib/db.js';
import {
  BillingPlanBodyPatchSchema,
  BillingPlanBodySchema,
  ExerciseBodyPatchSchema,
  ExerciseBodySchema,
  FoodBodyPatchSchema,
  FoodBodySchema,
  FoodGroupBodyPatchSchema,
  FoodGroupBodySchema,
  NutritionTemplateBodyPatchSchema,
  NutritionTemplateBodySchema,
  SupplementBodyPatchSchema,
  SupplementBodySchema,
  WorkoutTemplateBodyPatchSchema,
  WorkoutTemplateBodySchema,
} from '../../coach-assets/_lib/schemas.js';
import { loadStarterExercises } from '../../coach-assets/_lib/exerciseLibrary.js';
import { STARTER_FOODS, STARTER_FOOD_GROUPS, STARTER_TEMPLATES, type StarterFood } from '../../coach-assets/_lib/starterLibraryData.js';
import { buildTemplate, groupByMuscle } from '../../coach-assets/_lib/starterLibraryBuild.js';
import type { CoachExerciseDoc, CoachFoodDoc, CoachFoodGroupDoc, StoredFood } from '../../coach-assets/_lib/types.js';

/**
 * `coach-assets` covers 7 near-identical CRUD resources (see the module's old
 * `_handlers/*.ts`: list+create shared one file, get/update/delete shared
 * another, differing only in collection/schema/sort/error-text/whether the
 * response keeps `coachId`). Rather than port that 1:1 fourteen times, this
 * factory captures the shared shape once; each resource below is just its
 * four points of difference.
 */
type AssetDoc = { _id: string; coachId: string; createdAt: number; updatedAt: number };

interface AssetResourceConfig<TDoc extends AssetDoc, TPublic> {
  col: () => Promise<Collection<TDoc>>;
  bodySchema: ZodTypeAny;
  patchSchema: ZodTypeAny;
  sort: (a: TDoc, b: TDoc) => number;
  notFound: string;
  /**
   * Whether the public shape keeps `coachId`/`createdAt`/`updatedAt` — the
   * original REST handlers were inconsistent about this per resource
   * (matching whether the frontend type declares those fields at all:
   * `WorkoutTemplate`/`FoodGroup`/`NutritionTemplate`/`CoachSubscriptionPlan`
   * have them, `Exercise`/`LibraryFood`/`LibrarySupplement` don't). A function
   * (rather than a boolean flag) so each resource's concrete return shape —
   * and thus its compatibility with the frontend type it feeds — is inferred
   * per instantiation instead of widened to a shared union.
   */
  toPublic: (doc: TDoc) => TPublic;
}

/** For resources whose frontend type has no coachId/createdAt/updatedAt (Exercise, LibraryFood, LibrarySupplement). */
function stripMeta<TDoc extends AssetDoc>(doc: TDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return { id: _id, ...fields };
}

/** For resources whose frontend type keeps coachId/createdAt/updatedAt (WorkoutTemplate, FoodGroup, NutritionTemplate, CoachSubscriptionPlan). */
function keepMeta<TDoc extends AssetDoc>(doc: TDoc) {
  const { _id, ...fields } = doc;
  return { id: _id, ...fields };
}

function makeAssetRouter<TDoc extends AssetDoc, TPublic>(cfg: AssetResourceConfig<TDoc, TPublic>) {
  return router({
    /**
     * GET list — any signed-in user who owns `coachId` (default: themself) or
     * holds `users.read`; deliberately `authedProcedure` (no active-status
     * requirement) — matches the old REST `requireReadContext`, which allowed
     * a pending/suspended coach to still read their OWN asset library.
     */
    list: authedProcedure
      .input(z.object({ coachId: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const coachId = input?.coachId || ctx.user.id;
        requireReadAccess(ctx.user, coachId);
        const col = await cfg.col();
        const docs = (await col.find({ coachId } as Parameters<typeof col.find>[0]).toArray()) as unknown as TDoc[];
        docs.sort(cfg.sort);
        return docs.map((d) => cfg.toPublic(d));
      }),

    get: authedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
      const col = await cfg.col();
      const doc = (await col.findOne({ _id: input.id } as Parameters<typeof col.findOne>[0])) as unknown as TDoc | null;
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: cfg.notFound });
      requireReadAccess(ctx.user, doc.coachId);
      return cfg.toPublic(doc);
    }),

    /** POST create/replace — upsert by client-supplied id, always scoped to the caller's own coachId. */
    save: roleProcedure('coach')
      .input(cfg.bodySchema)
      .mutation(async ({ ctx, input }) => {
        const body = input as { id: string } & Record<string, unknown>;
        const col = await cfg.col();
        const now = Date.now();
        const filter = { _id: body.id, coachId: ctx.user.id } as Parameters<typeof col.findOne>[0];
        const existing = await col.findOne(filter);
        const doc = {
          ...body,
          _id: body.id,
          coachId: ctx.user.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        } as unknown as TDoc;
        await col.replaceOne(filter, doc, { upsert: true });
        return cfg.toPublic(doc);
      }),

    update: roleProcedure('coach')
      .input(z.object({ id: z.string().min(1) }).and(cfg.patchSchema))
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input as { id: string } & Record<string, unknown>;
        const col = await cfg.col();
        const filter = { _id: id, coachId: ctx.user.id } as Parameters<typeof col.findOne>[0];
        const existing = await col.findOne(filter);
        if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: cfg.notFound });
        const updated = { ...existing, ...patch, updatedAt: Date.now() } as TDoc;
        await col.replaceOne(filter, updated);
        return cfg.toPublic(updated);
      }),

    delete: roleProcedure('coach')
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const col = await cfg.col();
        const result = await col.deleteOne({ _id: input.id, coachId: ctx.user.id } as Parameters<typeof col.findOne>[0]);
        if (result.deletedCount === 0) throw new TRPCError({ code: 'NOT_FOUND', message: cfg.notFound });
      }),
  });
}

const exercisesRouter = makeAssetRouter({
  col: coachExercisesCol,
  bodySchema: ExerciseBodySchema,
  patchSchema: ExerciseBodyPatchSchema,
  sort: (a, b) => a.name.localeCompare(b.name),
  notFound: 'Exercise not found',
  toPublic: stripMeta,
});

const workoutTemplatesRouter = makeAssetRouter({
  col: coachWorkoutTemplatesCol,
  bodySchema: WorkoutTemplateBodySchema,
  patchSchema: WorkoutTemplateBodyPatchSchema,
  sort: (a, b) => b.updatedAt - a.updatedAt,
  notFound: 'Workout template not found',
  toPublic: keepMeta,
});

const nutritionTemplatesRouter = makeAssetRouter({
  col: coachNutritionTemplatesCol,
  bodySchema: NutritionTemplateBodySchema,
  patchSchema: NutritionTemplateBodyPatchSchema,
  sort: (a, b) => b.updatedAt - a.updatedAt,
  notFound: 'Nutrition template not found',
  toPublic: keepMeta,
});

const foodsRouter = makeAssetRouter({
  col: coachFoodsCol,
  bodySchema: FoodBodySchema,
  patchSchema: FoodBodyPatchSchema,
  sort: (a, b) => a.name.en.localeCompare(b.name.en),
  notFound: 'Food not found',
  toPublic: stripMeta,
});

const foodGroupsRouter = makeAssetRouter({
  col: coachFoodGroupsCol,
  bodySchema: FoodGroupBodySchema,
  patchSchema: FoodGroupBodyPatchSchema,
  sort: (a, b) => b.updatedAt - a.updatedAt,
  notFound: 'Food group not found',
  toPublic: keepMeta,
});

const supplementsRouter = makeAssetRouter({
  col: coachSupplementsCol,
  bodySchema: SupplementBodySchema,
  patchSchema: SupplementBodyPatchSchema,
  sort: (a, b) => a.name.localeCompare(b.name),
  notFound: 'Supplement not found',
  toPublic: stripMeta,
});

const billingPlansRouter = makeAssetRouter({
  col: coachBillingPlansCol,
  bodySchema: BillingPlanBodySchema,
  patchSchema: BillingPlanBodyPatchSchema,
  sort: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  notFound: 'Billing plan not found',
  toPublic: keepMeta,
});

async function existingIds<T extends { _id: string }>(col: Collection<T>, coachId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await col
    .find({ coachId, _id: { $in: ids } } as unknown as Parameters<typeof col.find>[0], { projection: { _id: 1 } })
    .toArray();
  return new Set(rows.map((r) => r._id));
}

/**
 * Seeds the shared exercise dataset, static starter foods/food-groups, and
 * the muscle-blueprint workout templates into the calling coach's own
 * collections. Non-destructive: only inserts rows the coach doesn't already
 * have (by id) — never touches existing docs, seeded or coach-authored.
 */
const seedStarterLibrary = roleProcedure('coach').mutation(async ({ ctx }) => {
  const coachId = ctx.user.id;
  const now = Date.now();

  const exercises = loadStarterExercises();
  const exCol = await coachExercisesCol();
  const haveExIds = await existingIds(exCol, coachId, exercises.map((e) => e.id));
  const newExercises: CoachExerciseDoc[] = exercises
    .filter((e) => !haveExIds.has(e.id))
    .map((e) => ({ ...e, _id: e.id, coachId, createdAt: now, updatedAt: now }));
  if (newExercises.length) await exCol.insertMany(newExercises);

  const foodById = new Map<string, StarterFood>(STARTER_FOODS.map((f) => [f.id, f]));
  const foodsCol = await coachFoodsCol();
  const haveFoodIds = await existingIds(foodsCol, coachId, STARTER_FOODS.map((f) => f.id));
  const newFoods: CoachFoodDoc[] = STARTER_FOODS.filter((f) => !haveFoodIds.has(f.id)).map((f) => ({
    ...f,
    _id: f.id,
    coachId,
    createdAt: now,
    updatedAt: now,
  }));
  if (newFoods.length) await foodsCol.insertMany(newFoods);

  const fgCol = await coachFoodGroupsCol();
  const haveFgIds = await existingIds(fgCol, coachId, STARTER_FOOD_GROUPS.map((g) => g.id));
  const newGroups: CoachFoodGroupDoc[] = STARTER_FOOD_GROUPS.filter((g) => !haveFgIds.has(g.id)).map((g) => {
    const foods: StoredFood[] = g.foodIds.map((id) => foodById.get(id)).filter((f): f is StarterFood => Boolean(f));
    return { _id: g.id, coachId, name: g.name, foods, ...(g.notes ? { notes: g.notes } : {}), createdAt: now, updatedAt: now };
  });
  if (newGroups.length) await fgCol.insertMany(newGroups);

  const byMuscle = groupByMuscle(exercises);
  const wtCol = await coachWorkoutTemplatesCol();
  const haveWtIds = await existingIds(wtCol, coachId, STARTER_TEMPLATES.map((t) => t.id));
  const newTemplates = STARTER_TEMPLATES.filter((t) => !haveWtIds.has(t.id)).map((t) => buildTemplate(t, byMuscle, coachId, now));
  if (newTemplates.length) await wtCol.insertMany(newTemplates);

  return {
    exercises: { inserted: newExercises.length, skipped: exercises.length - newExercises.length },
    foods: { inserted: newFoods.length, skipped: STARTER_FOODS.length - newFoods.length },
    groups: { inserted: newGroups.length, skipped: STARTER_FOOD_GROUPS.length - newGroups.length },
    templates: { inserted: newTemplates.length, skipped: STARTER_TEMPLATES.length - newTemplates.length },
  };
});

export const coachAssetsRouter = router({
  exercises: exercisesRouter,
  workoutTemplates: workoutTemplatesRouter,
  nutritionTemplates: nutritionTemplatesRouter,
  foods: foodsRouter,
  foodGroups: foodGroupsRouter,
  supplements: supplementsRouter,
  billingPlans: billingPlansRouter,
  seedStarterLibrary,
});
