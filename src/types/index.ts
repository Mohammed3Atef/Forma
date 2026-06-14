/**
 * Central domain model for Gym Tracker.
 * All dates that represent a *calendar day* use ISO `YYYY-MM-DD` strings (local day).
 * All timestamps (instants) use epoch milliseconds (number).
 */

export type LocalizedText = { en: string; ar: string };

export type Locale = 'en' | 'ar';
export type Theme = 'dark' | 'light';

/** A day key in `YYYY-MM-DD` form. */
export type DayKey = string;

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type Goal = 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintenance' | 'strength';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  weightKg: number;
  heightCm: number;
  goal: Goal;
  activityLevel: ActivityLevel;
  locale: Locale;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Workout plan
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  name: string;
  targetMuscle: string;
  /** Free-text describing warm-up sets, e.g. "1 set, 15-20 reps". */
  warmupSets: string;
  /** Number of working sets prescribed. */
  workingSets: number;
  /** Free-text rep range, e.g. "8-12" or "AMRAP". */
  repRange: string;
  /** Reps in reserve (target effort). */
  rir: string;
  /** Tempo notation, e.g. "1:02:01". */
  tempo: string;
  notes: LocalizedText;
  /** Default rest in seconds for this exercise. */
  restSec: number;
  videoId: string | null;
}

export interface WorkoutDay {
  id: string;
  dayIndex: number;
  title: string;
  focus: string;
  exerciseIds: string[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  weeklyVolume?: Record<string, string>;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Workout logging
// ---------------------------------------------------------------------------

export type SetType = 'warmup' | 'working';

export interface SetLog {
  setIndex: number;
  type: SetType;
  targetReps: string;
  actualReps: number | null;
  weightKg: number | null;
  rpe: number | null;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  sets: SetLog[];
  done: boolean;
}

export interface WorkoutLog {
  id: string; // == date
  date: DayKey;
  dayId: string;
  /** When the session timer was started. null = opened but not started yet. */
  startedAt: number | null;
  endedAt: number | null;
  durationSec: number;
  exercises: ExerciseLog[];
  /** When false, this is an in-progress session (used for recovery). */
  finished: boolean;
  updatedAt: number;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'postWorkout';

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface FoodItem {
  id: string;
  name: LocalizedText;
  quantity: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
}

export interface Meal {
  id: string;
  slot: MealSlot;
  label: LocalizedText;
  items: FoodItem[];
}

export interface Supplement {
  id: string;
  name: string;
  dose: LocalizedText;
}

export interface MealPlan {
  id: string;
  name: string;
  meals: Meal[];
  targets: Macros;
  supplements: Supplement[];
  waterTargetMl: number;
  beverageNotes: LocalizedText[];
  generalNotes: LocalizedText[];
  updatedAt: number;
}

export interface NutritionLog {
  id: string; // == date
  date: DayKey;
  /** mealId -> eaten? */
  mealsEaten: Record<string, boolean>;
  /** supplementId -> taken? */
  supplementsTaken: Record<string, boolean>;
  customFoods: FoodItem[];
  /**
   * Per-day swaps of a PLANNED food item (keyed by the original item id):
   * a FoodItem = replacement for that day; null = removed for that day.
   * The original stays in the plan and is shown struck-through.
   */
  itemOverrides: Record<string, FoodItem | null>;
  /** Extra foods added to a planned meal for that day (keyed by mealId). */
  extraItems: Record<string, FoodItem[]>;
  waterMl: number;
  creatineTaken: boolean;
  updatedAt: number;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Cardio / Steps / Weight
// ---------------------------------------------------------------------------

export type CardioType = 'walking' | 'treadmill' | 'running' | 'cycling' | 'other';

export interface CardioLog {
  id: string;
  date: DayKey;
  type: CardioType;
  durationSec: number;
  distanceKm: number | null;
  caloriesBurned: number | null;
  steps: number | null;
  updatedAt: number;
  dirty: boolean;
}

export interface WeightLog {
  id: string; // == date
  date: DayKey;
  weightKg: number;
  updatedAt: number;
  dirty: boolean;
}

export type MeasurementKey =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'upperBack'
  | 'arm'
  | 'forearm'
  | 'wrist'
  | 'waist'
  | 'abdomen'
  | 'hips'
  | 'glutes'
  | 'thigh'
  | 'calf'
  | 'ankle';

/** A user-defined measurement part (in addition to the built-in ones). */
export interface CustomMeasurement {
  key: string;
  label: string;
}

/**
 * Body measurements (cm) logged on a given day, for before/after comparison.
 * Keyed by a built-in MeasurementKey OR a custom part key.
 */
export interface MeasurementLog {
  id: string; // == date
  date: DayKey;
  values: Record<string, number>;
  updatedAt: number;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export type VideoKind = 'file' | 'youtube' | 'unknown';
export type VideoStatus =
  | 'link-pending'
  | 'not-downloaded'
  | 'downloading'
  | 'downloaded'
  | 'failed';

export interface VideoAsset {
  id: string;
  exerciseId: string;
  title: string;
  sourceUrl: string | null;
  kind: VideoKind;
  status: VideoStatus;
  localKey?: string;
  sizeBytes?: number;
  /** Set when the user pasted their own URL — seed upgrades won't replace it. */
  userEdited?: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Progress photos
// ---------------------------------------------------------------------------

export type PhotoPose = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  date: DayKey;
  pose: PhotoPose;
  /** Key into the local blob store (IndexedDB). */
  localKey: string;
  weightKg?: number;
  note?: string;
  updatedAt: number;
  dirty: boolean;
}

// ---------------------------------------------------------------------------
// Habit / daily checklist / streaks / reminders
// ---------------------------------------------------------------------------

/**
 * Checklist item keys. Meal items are dynamic: `meal:<mealId>`.
 */
export type ChecklistKey =
  | 'workout'
  | 'supplements'
  | 'water'
  | 'steps'
  | 'cardio'
  | 'creatine'
  | `meal:${string}`;

export interface ChecklistItemState {
  done: boolean;
  /** True when flipped by an auto-rule (vs manual toggle). */
  auto: boolean;
}

export interface DailyChecklist {
  id: DayKey; // == date
  date: DayKey;
  items: Record<string, ChecklistItemState>;
  completionPct: number;
  fullyComplete: boolean;
  updatedAt: number;
  dirty: boolean;
}

export type ReminderKind =
  | 'meal'
  | 'supplements'
  | 'creatine'
  | 'water'
  | 'workout'
  | 'cardio';

export interface Reminder {
  id: string;
  kind: ReminderKind;
  label: string;
  /** "HH:mm" 24h local time. */
  time: string;
  enabled: boolean;
  /** Days of week 0 (Sun) - 6 (Sat). Empty = every day. */
  repeatDays: number[];
  lastFiredDate?: DayKey;
  updatedAt: number;
  dirty: boolean;
}

export interface StreakValue {
  current: number;
  longest: number;
  lastDate: DayKey | null;
}

export interface Streaks {
  workout: StreakValue;
  nutrition: StreakValue;
  water: StreakValue;
  steps: StreakValue;
  overall: StreakValue;
}

// ---------------------------------------------------------------------------
// Settings & targets
// ---------------------------------------------------------------------------

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  waterMl: number;
  steps: number;
  cardioMinutes: number;
}

export interface AppSettings {
  locale: Locale;
  theme: Theme;
  restDefaultSec: number;
  /** Target number of workouts per week (shown on the Home weekly-goal ring). */
  weeklyWorkoutGoal: number;
  keepAwakeDuringWorkout: boolean;
  vibrationEnabled: boolean;
  notificationsEnabled: boolean;
  targets: DailyTargets;
  /** Extra body-measurement parts the user added. */
  customMeasurements: CustomMeasurement[];
  updatedAt: number;
}

export interface TimerLog {
  id: string;
  kind: 'session' | 'rest' | 'cardio';
  startedAt: number;
  durationSec: number;
}
