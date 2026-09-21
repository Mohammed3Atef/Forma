/**
 * Backend-local mirror of the "coachAssets/{coachId}/..." shapes in
 * `src/types/index.ts`, flattened into one Mongo collection per former
 * Firestore sub-collection (see the six `coach*` collections below). Kept
 * deliberately duplicated from `src/types/index.ts` for the same reason
 * `api/_lib/types.ts` duplicates the identity model — the `@/*` Vite alias
 * isn't available inside Vercel's per-function bundler.
 *
 * IDENTITY MODEL: `_id` is Mongo's own internal identity (an auto-assigned
 * `ObjectId` — never exposed to the frontend). `id` is Forma's logical asset
 * id (the value the frontend calls `Exercise.id`/`WorkoutTemplate.id`/etc,
 * and what `libraryExerciseId` links against). The two are DELIBERATELY
 * separate: a bare `id` is only unique PER COACH, not globally — two coaches
 * legitimately have their own row with the same logical id (e.g. every coach
 * who seeds the starter library gets a row with `id: "wger-12"`). Every
 * lookup/write on these collections must therefore filter by `{ coachId, id }`
 * together, never by a bare `_id`/`id`. Enforced with a unique compound index
 * on `{ coachId: 1, id: 1 }` (see `./db.ts`'s `ensureCoachAssetIndexes` and
 * `scripts/mongo-init-indexes.mjs`) — this used to be modeled as `_id = id`
 * directly, which made `_id` (Mongo's globally-unique primary key) collide
 * the moment two coaches shared a logical id; that bug is what this comment
 * replaces.
 */

import type { ObjectId } from 'mongodb';

export type LocalizedText = { en: string; ar: string };

export interface WorkoutSection {
  id: string;
  title: string;
  kind: 'normal' | 'warmup' | 'working' | 'mobility' | 'finisher';
  exerciseIds: string[];
}

export interface WorkoutDay {
  id: string;
  dayIndex: number;
  title: string;
  focus: string;
  exerciseIds: string[];
  sections?: WorkoutSection[];
}

export type WorkoutGoal = 'hypertrophy' | 'fat_loss' | 'strength' | 'beginner' | 'advanced' | 'custom';
export type SplitType = 'ppl' | 'upper_lower' | 'full_body' | 'bro_split' | 'custom';

/** Embedded exercise shape (used both standalone in `coachExercises` and inline in template bodies). */
export interface ExerciseFields {
  name: string;
  targetMuscle: string;
  warmupSets: string;
  warmupSetCount?: number;
  workingSets: number;
  repRange: string;
  rir: string;
  tempo: string;
  notes: LocalizedText;
  restSec: number;
  videoId: string | null;
  videoUrl?: string | null;
  category?: string;
  equipment?: string;
  tags?: string[];
  progressionNotes?: string;
  imageUrl?: string | null;
  images?: string[];
  // ---- Extra descriptive fields present on the seeded free-exercise-db
  // dataset (see `./exerciseLibrary.ts`) — not formally part of the
  // frontend `Exercise` type, but Firestore stored them verbatim on the doc.
  level?: 'beginner' | 'intermediate' | 'expert';
  muscleAr?: string;
  equipmentAr?: string;
  categoryAr?: string;
  source?: string;
  // ---- Import provenance (mirrors src/types/index.ts's `Exercise`) ----------
  sourceId?: string;
  sourceProvider?: 'wger';
  sourceCategory?: string;
  muscles?: string[];
  secondaryMuscles?: string[];
  equipmentList?: string[];
  // ---- Library → template/plan link (embedded copies only) -----------------
  libraryExerciseId?: string;
  librarySyncEnabled?: boolean;
}

/** `coachExercises` — was `coachAssets/{coachId}/exercises/{id}`. */
export interface CoachExerciseDoc extends ExerciseFields {
  _id: ObjectId;
  id: string;
  coachId: string;
  createdAt: number;
  updatedAt: number;
}

/** Full embedded exercise (with its own id) as stored inline in a template's `exercises` map. */
export interface TemplateExercise extends ExerciseFields {
  id: string;
}

/** `coachWorkoutTemplates` — was `coachAssets/{coachId}/workoutTemplates/{id}`. */
export interface CoachWorkoutTemplateDoc {
  _id: ObjectId;
  id: string;
  coachId: string;
  name: string;
  goal: WorkoutGoal;
  splitType: SplitType;
  days: WorkoutDay[];
  exercises: Record<string, TemplateExercise>;
  createdAt: number;
  updatedAt: number;
}

export interface FoodItem {
  id: string;
  name: LocalizedText;
  quantity: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
  allowedAlternativeGroupId?: string;
  allowedAlternatives?: FoodItem[];
  allowCustomSubstitution?: boolean;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'postWorkout';

export interface Meal {
  id: string;
  slot: MealSlot;
  label: LocalizedText;
  items: FoodItem[];
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface Supplement {
  id: string;
  name: string;
  dose: LocalizedText;
  timing?: LocalizedText;
}

/** `coachSupplements` — was `coachAssets/{coachId}/supplements` (`LibrarySupplement`). */
export interface LibrarySupplementFields {
  name: string;
  dose: LocalizedText;
  timing?: LocalizedText;
  category?: string;
  tags?: string[];
}
export interface CoachSupplementDoc extends LibrarySupplementFields {
  _id: ObjectId;
  id: string;
  coachId: string;
  createdAt: number;
  updatedAt: number;
}

/** `coachNutritionTemplates` — was `coachAssets/{coachId}/nutritionTemplates/{id}`. */
export interface CoachNutritionTemplateDoc {
  _id: ObjectId;
  id: string;
  coachId: string;
  name: string;
  meals: Meal[];
  targets: Macros;
  supplements: Supplement[];
  waterTargetMl: number;
  createdAt: number;
  updatedAt: number;
}

/** Shared food fields (a `LibraryFood` minus its id) — standalone in `coachFoods`, embedded in `coachFoodGroups.foods`. */
export interface FoodFields {
  name: LocalizedText;
  quantity: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
  allowedAlternativeGroupId?: string;
  allowedAlternatives?: FoodItem[];
  allowCustomSubstitution?: boolean;
  category?: string;
  tags?: string[];
}

/** A `LibraryFood` with its id — the embedded shape inside `coachFoodGroups.foods` (no coachId/timestamps of its own). */
export interface StoredFood extends FoodFields {
  id: string;
}

/** `coachFoods` — was `coachAssets/{coachId}/foods/{id}` (`LibraryFood`). */
export interface CoachFoodDoc extends FoodFields {
  _id: ObjectId;
  id: string;
  coachId: string;
  createdAt: number;
  updatedAt: number;
}

/** `coachFoodGroups` — was `coachAssets/{coachId}/foodGroups/{id}` (`FoodGroup`). */
export interface CoachFoodGroupDoc {
  _id: ObjectId;
  id: string;
  coachId: string;
  name: string;
  foods: StoredFood[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * `coachBillingPlans` — was `coachAssets/{coachId}/plans/{id}` (`CoachSubscriptionPlan`,
 * the coach's own Layer-B plan templates offered to their clients — distinct
 * from the coach's own Layer-A `coachPlans`/`CoachPlan` Forma subscription).
 */
export interface CoachBillingPlanDoc {
  _id: ObjectId;
  id: string;
  coachId: string;
  name: string;
  unit: 'days' | 'months';
  duration: number;
  price?: number;
  isTrial?: boolean;
  order?: number;
  archived?: boolean;
  createdAt: number;
  updatedAt: number;
}
