import type { Collection, ObjectId } from 'mongodb';
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
import { STARTER_FOODS, STARTER_FOOD_GROUPS, STARTER_SUPPLEMENTS, STARTER_TEMPLATES, type StarterFood } from '../../coach-assets/_lib/starterLibraryData.js';
import { buildTemplate, groupByMuscle } from '../../coach-assets/_lib/starterLibraryBuild.js';
import type { CoachExerciseDoc, CoachFoodDoc, CoachFoodGroupDoc, CoachSupplementDoc, StoredFood } from '../../coach-assets/_lib/types.js';
import { propagateExerciseToTemplates } from '../../coach-assets/_lib/exerciseSync.js';

/**
 * `coach-assets` covers 7 near-identical CRUD resources (see the module's old
 * `_handlers/*.ts`: list+create shared one file, get/update/delete shared
 * another, differing only in collection/schema/sort/error-text/whether the
 * response keeps `coachId`). Rather than port that 1:1 fourteen times, this
 * factory captures the shared shape once; each resource below is just its
 * four points of difference.
 */
type AssetDoc = { _id: ObjectId; id: string; coachId: string; createdAt: number; updatedAt: number };

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

/**
 * For resources whose frontend type has no coachId/createdAt/updatedAt
 * (Exercise, LibraryFood, LibrarySupplement). `_id` (Mongo's internal
 * ObjectId identity) is dropped here and NEVER sent to the frontend — the
 * public identifier is the doc's own `id` field (see the identity-model
 * comment in `../../coach-assets/_lib/types.ts`).
 */
function stripMeta<TDoc extends AssetDoc>(doc: TDoc) {
  const { _id, coachId: _coachId, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = doc;
  return fields;
}

/** For resources whose frontend type keeps coachId/createdAt/updatedAt (WorkoutTemplate, FoodGroup, NutritionTemplate, CoachSubscriptionPlan). `_id` is still dropped — same reason as `stripMeta`. */
function keepMeta<TDoc extends AssetDoc>(doc: TDoc) {
  const { _id, ...fields } = doc;
  return fields;
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

    /**
     * A bare logical `id` is only unique PER COACH (see the identity-model
     * comment in `../../coach-assets/_lib/types.ts`), so a lookup-by-id-alone
     * is ambiguous across coaches now — `coachId` (default: the caller
     * themself) is required to resolve which coach's row to read. This is
     * the same shape `list` already uses; `requireReadAccess` still gates a
     * caller reading a DIFFERENT coach's row (e.g. an admin with
     * `users.read`, who must now know which coach to ask for).
     */
    get: authedProcedure.input(z.object({ id: z.string().min(1), coachId: z.string().optional() })).query(async ({ ctx, input }) => {
      const coachId = input.coachId || ctx.user.id;
      requireReadAccess(ctx.user, coachId);
      const col = await cfg.col();
      const doc = (await col.findOne({ coachId, id: input.id } as Parameters<typeof col.findOne>[0])) as unknown as TDoc | null;
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: cfg.notFound });
      return cfg.toPublic(doc);
    }),

    /**
     * POST create/replace — upsert by client-supplied id, always scoped to
     * the caller's own coachId. Filters/writes by `{coachId, id}` (the
     * unique-indexed compound key — see `../../coach-assets/_lib/db.ts`),
     * never by `_id`: `_id` is Mongo's own internal ObjectId identity, opaque
     * to this layer, and deliberately left unset here so Mongo assigns one on
     * insert / keeps the existing one on replace.
     */
    save: roleProcedure('coach')
      .input(cfg.bodySchema)
      .mutation(async ({ ctx, input }) => {
        const body = input as { id: string } & Record<string, unknown>;
        const col = await cfg.col();
        const now = Date.now();
        const filter = { coachId: ctx.user.id, id: body.id } as Parameters<typeof col.findOne>[0];
        const existing = await col.findOne(filter);
        const doc = {
          ...body,
          id: body.id,
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
        const filter = { coachId: ctx.user.id, id } as Parameters<typeof col.findOne>[0];
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
        const result = await col.deleteOne({ coachId: ctx.user.id, id: input.id } as Parameters<typeof col.findOne>[0]);
        if (result.deletedCount === 0) throw new TRPCError({ code: 'NOT_FOUND', message: cfg.notFound });
      }),
  });
}

/**
 * Exercises get bespoke `save`/`update` instead of the generic factory's:
 * after every edit to an EXISTING exercise, propagate its media/identity
 * fields into linked templates (`propagateExerciseToTemplates`) and report
 * that outcome distinctly from "the exercise itself failed to save" (the
 * generic factory's `save`/`update` return a bare `TPublic` for every OTHER
 * resource — giving exercises a different response shape here, rather than
 * threading an optional hook through the shared factory, keeps every other
 * resource's inferred return type untouched).
 */
const exercisesBase = makeAssetRouter({
  col: coachExercisesCol,
  bodySchema: ExerciseBodySchema,
  patchSchema: ExerciseBodyPatchSchema,
  sort: (a, b) => a.name.localeCompare(b.name),
  notFound: 'Exercise not found',
  toPublic: stripMeta,
});

const exercisesRouter = router({
  list: exercisesBase.list,
  get: exercisesBase.get,
  delete: exercisesBase.delete,
  save: roleProcedure('coach')
    .input(ExerciseBodySchema)
    .mutation(async ({ ctx, input }) => {
      const col = await coachExercisesCol();
      const now = Date.now();
      const filter = { coachId: ctx.user.id, id: input.id };
      const existing = await col.findOne(filter);
      const doc = {
        ...input,
        id: input.id,
        coachId: ctx.user.id,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } as unknown as CoachExerciseDoc;
      await col.replaceOne(filter, doc, { upsert: true });
      const sync = await propagateExerciseToTemplates(doc, existing);
      return { exercise: stripMeta(doc), sync };
    }),
  update: roleProcedure('coach')
    .input(z.object({ id: z.string().min(1) }).and(ExerciseBodyPatchSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      const col = await coachExercisesCol();
      const filter = { coachId: ctx.user.id, id };
      const existing = await col.findOne(filter);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Exercise not found' });
      const updated: CoachExerciseDoc = { ...existing, ...patch, updatedAt: Date.now() };
      await col.replaceOne(filter, updated);
      const sync = await propagateExerciseToTemplates(updated, existing);
      return { exercise: stripMeta(updated), sync };
    }),
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

async function existingIds<T extends { id: string }>(col: Collection<T>, coachId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await col
    .find({ coachId, id: { $in: ids } } as unknown as Parameters<typeof col.find>[0], { projection: { id: 1 } })
    .toArray();
  return new Set(rows.map((r) => r.id));
}

interface SeedStepResult {
  inserted: number;
  skipped: number;
  error?: string;
}

/**
 * Runs one seed category in isolation: a failure here (a transient Mongo
 * error, a bad-data edge case, etc.) is reported on ITS OWN key instead of
 * throwing and aborting the whole mutation — otherwise a failure in, say,
 * templates would silently prevent foods/groups/supplements from ever being
 * inserted, with the coach seeing no exercises-succeeded feedback at all to
 * explain why "load starter library" looked like it only did part of the
 * job. Each step is independently safe to retry (idempotent via `existingIds`).
 */
async function runSeedStep(fn: () => Promise<{ inserted: number; skipped: number }>): Promise<SeedStepResult> {
  try {
    return await fn();
  } catch (err) {
    return { inserted: 0, skipped: 0, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Seeds the shared exercise dataset, static starter foods/food-groups/
 * supplements, and the muscle-blueprint workout templates into the calling
 * coach's own collections. Non-destructive: only inserts rows the coach
 * doesn't already have (by id) — never touches existing docs, seeded or
 * coach-authored. Each of the 5 categories runs independently (see
 * `runSeedStep`) so a problem in one never hides/blocks the others.
 */
const seedStarterLibrary = roleProcedure('coach').mutation(async ({ ctx }) => {
  const coachId = ctx.user.id;
  const now = Date.now();

  const exercises = loadStarterExercises();
  const exercisesResult = await runSeedStep(async () => {
    const exCol = await coachExercisesCol();
    const haveIds = await existingIds(exCol, coachId, exercises.map((e) => e.id));
    const rows = exercises
      .filter((e) => !haveIds.has(e.id))
      .map((e) => ({ ...e, id: e.id, coachId, createdAt: now, updatedAt: now }) as unknown as CoachExerciseDoc);
    if (rows.length) await exCol.insertMany(rows);
    return { inserted: rows.length, skipped: exercises.length - rows.length };
  });

  const foodById = new Map<string, StarterFood>(STARTER_FOODS.map((f) => [f.id, f]));
  const foodsResult = await runSeedStep(async () => {
    const foodsCol = await coachFoodsCol();
    const haveIds = await existingIds(foodsCol, coachId, STARTER_FOODS.map((f) => f.id));
    const rows = STARTER_FOODS.filter((f) => !haveIds.has(f.id)).map(
      (f) => ({ ...f, id: f.id, coachId, createdAt: now, updatedAt: now }) as unknown as CoachFoodDoc,
    );
    if (rows.length) await foodsCol.insertMany(rows);
    return { inserted: rows.length, skipped: STARTER_FOODS.length - rows.length };
  });

  const groupsResult = await runSeedStep(async () => {
    const fgCol = await coachFoodGroupsCol();
    const haveIds = await existingIds(fgCol, coachId, STARTER_FOOD_GROUPS.map((g) => g.id));
    const rows = STARTER_FOOD_GROUPS.filter((g) => !haveIds.has(g.id)).map((g) => {
      const foods: StoredFood[] = g.foodIds.map((id) => foodById.get(id)).filter((f): f is StarterFood => Boolean(f));
      return { id: g.id, coachId, name: g.name, foods, ...(g.notes ? { notes: g.notes } : {}), createdAt: now, updatedAt: now } as unknown as CoachFoodGroupDoc;
    });
    if (rows.length) await fgCol.insertMany(rows);
    return { inserted: rows.length, skipped: STARTER_FOOD_GROUPS.length - rows.length };
  });

  const supplementsResult = await runSeedStep(async () => {
    const suppCol = await coachSupplementsCol();
    const haveIds = await existingIds(suppCol, coachId, STARTER_SUPPLEMENTS.map((s) => s.id));
    const rows = STARTER_SUPPLEMENTS.filter((s) => !haveIds.has(s.id)).map(
      (s) => ({ ...s, id: s.id, coachId, createdAt: now, updatedAt: now }) as unknown as CoachSupplementDoc,
    );
    if (rows.length) await suppCol.insertMany(rows);
    return { inserted: rows.length, skipped: STARTER_SUPPLEMENTS.length - rows.length };
  });

  const templatesResult = await runSeedStep(async () => {
    const byMuscle = groupByMuscle(exercises);
    const wtCol = await coachWorkoutTemplatesCol();
    const haveIds = await existingIds(wtCol, coachId, STARTER_TEMPLATES.map((t) => t.id));
    const rows = STARTER_TEMPLATES.filter((t) => !haveIds.has(t.id)).map((t) => buildTemplate(t, byMuscle, coachId, now));
    if (rows.length) await wtCol.insertMany(rows);
    return { inserted: rows.length, skipped: STARTER_TEMPLATES.length - rows.length };
  });

  return {
    exercises: exercisesResult,
    foods: foodsResult,
    groups: groupsResult,
    supplements: supplementsResult,
    templates: templatesResult,
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
