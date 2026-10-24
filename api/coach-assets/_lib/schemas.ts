import { z } from 'zod';
import { FoodImageRefSchema } from './foodImage.js';

/**
 * Optional field that also tolerates a stored `null` (legacy library-sync
 * copies wrote missing fields as null) by treating it as absent — so those
 * templates/plans can be saved again without widening the output type.
 */
const nullAsAbsent = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === null ? undefined : v), schema.optional());

/** zod mirrors of the shapes in `./types.ts` — request-body validation only (`_id`/`coachId`/timestamps are server-set). */

export const LocalizedTextSchema = z.object({ en: z.string(), ar: z.string() });

export const WorkoutSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: z.enum(['normal', 'warmup', 'working', 'mobility', 'finisher']),
  exerciseIds: z.array(z.string()),
});

export const WorkoutDaySchema = z.object({
  id: z.string().min(1),
  dayIndex: z.number(),
  title: z.string(),
  focus: z.string(),
  exerciseIds: z.array(z.string()),
  sections: z.array(WorkoutSectionSchema).optional(),
});

export const WorkoutGoalSchema = z.enum(['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom']);
export const SplitTypeSchema = z.enum(['ppl', 'upper_lower', 'full_body', 'bro_split', 'custom']);

/**
 * B4 — a copy taken from the Forma catalog keeps its link (catalog id + revision), its bilingual
 * name, its structured bilingual instructions and the credit lines its media must show. Optional:
 * coach-written exercises have none of them. Lengths mirror the catalog contract.
 */
const CatalogLine = z.string().trim().min(1).max(400);
const CatalogInstructionSetSchema = z.object({
  setup: z.array(CatalogLine).max(6),
  steps: z.array(CatalogLine).max(8),
  cues: z.array(CatalogLine).max(5),
  mistakes: z.array(CatalogLine).max(5),
  safety: z.array(CatalogLine).max(3),
});
export const MediaCreditSchema = z.object({
  url: z.string().trim().max(2000),
  kind: z.enum(['image', 'video']),
  author: z.string().trim().min(1).max(200),
  license: z.string().trim().min(1).max(40),
  sourcePage: z.string().trim().max(2000).optional(),
});
const CatalogExerciseLinkFields = {
  catalogId: z.string().trim().min(1).max(80).optional(),
  catalogRev: z.number().int().positive().optional(),
  names: LocalizedTextSchema.optional(),
  instructions: z.object({ en: CatalogInstructionSetSchema, ar: CatalogInstructionSetSchema }).optional(),
  mediaCredits: z.array(MediaCreditSchema).max(8).optional(),
};

const ExerciseFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  targetMuscle: z.string().max(100),
  warmupSets: z.string().max(200),
  warmupSetCount: z.number().optional(),
  workingSets: z.number(),
  repRange: z.string().max(50),
  rir: z.string().max(50),
  tempo: z.string().max(50),
  notes: LocalizedTextSchema,
  restSec: z.number(),
  videoId: z.string().nullable(),
  // B0 / MD-09: only https links are stored (no javascript:/data:/http) — plain
  // http only on a loopback host (local dev / the isolated test CDN). Which
  // hosts can actually PLAY is checked where the coach types the link.
  videoUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/[^\s]*$/i.test(v), {
      message: 'Video links must be https:// links',
    })
    .nullable()
    .optional(),
  category: nullAsAbsent(z.string().max(100)),
  equipment: nullAsAbsent(z.string().max(100)),
  tags: z.array(z.string()).optional(),
  progressionNotes: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  images: nullAsAbsent(z.array(z.string())),
  /** B4.1: the still shown before a catalog demonstration plays (https, as for videoUrl). */
  videoPosterUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/[^\s]*$/i.test(v), { message: 'Poster links must be https:// links' })
    .nullable()
    .optional(),
  sourceId: z.string().optional(),
  sourceProvider: z.literal('wger').optional(),
  // B3-S11: the attribution line a seeded exercise carries survives a full save.
  source: z.string().max(200).optional(),
  sourceCategory: nullAsAbsent(z.string()),
  muscles: nullAsAbsent(z.array(z.string())),
  secondaryMuscles: nullAsAbsent(z.array(z.string())),
  equipmentList: nullAsAbsent(z.array(z.string())),
  libraryExerciseId: z.string().optional(),
  librarySyncEnabled: z.boolean().optional(),
  ...CatalogExerciseLinkFields,
});

/** Body for POST/PATCH `coachExercises` — `id` is client-supplied (mirrors the old `uid('ex')` doc-id scheme). */
export const ExerciseBodySchema = ExerciseFieldsSchema.extend({ id: z.string().min(1) });
export const ExerciseBodyPatchSchema = ExerciseFieldsSchema.partial();

/** Full embedded exercise (with its own id), as stored inline in a template's `exercises` map. */
export const TemplateExerciseSchema = ExerciseFieldsSchema.extend({ id: z.string().min(1) });

export const WorkoutTemplateBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  goal: WorkoutGoalSchema,
  splitType: SplitTypeSchema,
  days: z.array(WorkoutDaySchema),
  exercises: z.record(z.string(), TemplateExerciseSchema),
});
export const WorkoutTemplateBodyPatchSchema = WorkoutTemplateBodySchema.omit({ id: true }).partial();

/**
 * B4 — a food taken from the Forma catalog keeps what its macros were computed from: the catalog
 * link, the per-100 g values, the serving (portion id, amount, grams), the state (raw / cooked …),
 * whether the values are an estimate (with its note) and the data source + licence to credit.
 * A food found through the Open Food Facts search keeps its ODbL source the same way (FD-03).
 */
const LocalizedOptional = z.object({ en: z.string().max(400), ar: z.string().max(400) });
export const FoodProvenanceFields = {
  catalogId: z.string().trim().min(1).max(80).optional(),
  catalogRev: z.number().int().positive().optional(),
  per100g: z.object({ kcal: z.number().min(0), protein: z.number().min(0), carbs: z.number().min(0), fat: z.number().min(0), fiber: z.number().min(0).optional() }).optional(),
  portion: z.object({ id: z.string().trim().min(1).max(40), amount: z.number().positive(), grams: z.number().positive(), label: LocalizedOptional.optional() }).optional(),
  foodState: z.enum(['raw', 'cooked', 'dry', 'prepared', 'as-sold']).optional(),
  verification: z.enum(['source-values', 'recipe-estimate', 'proxy-estimate']).optional(),
  sourceNote: LocalizedOptional.optional(),
  source: z.object({ provider: z.enum(['forma-catalog', 'open-food-facts']), license: z.string().max(40), attribution: z.string().max(300), url: z.string().max(500).optional() }).optional(),
  /** B4.1: the food's picture (a copy — see `foodImage.ts`; who may use which picture is checked on save). */
  image: FoodImageRefSchema.nullable().optional(),
};

const FoodItemBaseSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema,
  quantity: z.string().max(100),
  protein: z.number(),
  carbs: z.number(),
  fats: z.number(),
  calories: z.number(),
  allowedAlternativeGroupId: z.string().optional(),
  allowCustomSubstitution: z.boolean().optional(),
  ...FoodProvenanceFields,
});
// `allowedAlternatives: FoodItem[]` is self-referential (one level deep in practice — a
// plan item's approved swaps are never themselves swappable), so `z.lazy` isn't needed here.
export const FoodItemSchema = FoodItemBaseSchema.extend({
  allowedAlternatives: z.array(FoodItemBaseSchema).optional(),
});

export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'postWorkout']);

export const MealSchema = z.object({
  id: z.string().min(1),
  slot: MealSlotSchema,
  label: LocalizedTextSchema,
  items: z.array(FoodItemSchema),
});

export const MacrosSchema = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fats: z.number(),
});

export const SupplementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dose: LocalizedTextSchema,
  timing: LocalizedTextSchema.optional(),
});

const LibrarySupplementFieldsSchema = z.object({
  name: z.string().min(1),
  dose: LocalizedTextSchema,
  timing: LocalizedTextSchema.optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
});
export const SupplementBodySchema = LibrarySupplementFieldsSchema.extend({ id: z.string().min(1) });
export const SupplementBodyPatchSchema = LibrarySupplementFieldsSchema.partial();

export const NutritionTemplateBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  meals: z.array(MealSchema),
  targets: MacrosSchema,
  supplements: z.array(SupplementSchema),
  waterTargetMl: z.number(),
});
export const NutritionTemplateBodyPatchSchema = NutritionTemplateBodySchema.omit({ id: true }).partial();

const FoodFieldsSchema = z.object({
  name: LocalizedTextSchema,
  quantity: z.string().max(100),
  protein: z.number(),
  carbs: z.number(),
  fats: z.number(),
  calories: z.number(),
  allowedAlternativeGroupId: z.string().optional(),
  allowedAlternatives: z.array(FoodItemSchema).optional(),
  allowCustomSubstitution: z.boolean().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  ...FoodProvenanceFields,
});
export const FoodBodySchema = FoodFieldsSchema.extend({ id: z.string().min(1) });
export const FoodBodyPatchSchema = FoodFieldsSchema.partial();

export const FoodGroupBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  foods: z.array(FoodBodySchema),
  notes: z.string().max(2000).optional(),
});
export const FoodGroupBodyPatchSchema = FoodGroupBodySchema.omit({ id: true }).partial();

export const BillingPlanBodySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  unit: z.enum(['days', 'months']),
  duration: z.number().positive(),
  price: z.number().nonnegative().optional(),
  isTrial: z.boolean().optional(),
  order: z.number().optional(),
  archived: z.boolean().optional(),
});
export const BillingPlanBodyPatchSchema = BillingPlanBodySchema.omit({ id: true }).partial();
