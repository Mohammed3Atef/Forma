import { z } from 'zod';

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
  videoUrl: z.string().nullable().optional(),
  category: z.string().max(100).optional(),
  equipment: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  progressionNotes: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
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
