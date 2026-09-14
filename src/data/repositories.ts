import type {
  AppSettings,
  CardioLog,
  DailyChecklist,
  MealPlan,
  MeasurementLog,
  NutritionLog,
  ProgressPhoto,
  Reminder,
  UserProfile,
  VideoAsset,
  WeightLog,
  WorkoutLog,
  WorkoutPlan,
} from '@/types';

/**
 * Generic document repository. Every storage adapter implements this same
 * shape, so stores and UI never know which backend is active. Items are
 * keyed by their `id`.
 */
export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  put(item: T): Promise<T>;
  putMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
}

/** A single-document repository (e.g. the active profile / settings). */
export interface SingletonRepository<T> {
  get(): Promise<T | null>;
  set(value: T): Promise<T>;
}

/**
 * The whole data layer, local-only (IndexedDB via localforage), with the
 * Mongo-backed `trpc.sync.*` procedures layered on top by SyncEngine — see
 * src/data/sync/SyncEngine.ts.
 */
export interface DataSource {
  readonly kind: 'local';
  profile: SingletonRepository<UserProfile>;
  settings: SingletonRepository<AppSettings>;
  workoutPlans: Repository<WorkoutPlan>;
  workoutLogs: Repository<WorkoutLog>;
  mealPlans: Repository<MealPlan>;
  nutritionLogs: Repository<NutritionLog>;
  cardioLogs: Repository<CardioLog>;
  weightLogs: Repository<WeightLog>;
  measurementLogs: Repository<MeasurementLog>;
  videoAssets: Repository<VideoAsset>;
  progressPhotos: Repository<ProgressPhoto>;
  dailyChecklists: Repository<DailyChecklist>;
  reminders: Repository<Reminder>;
}
