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
// Accounts, roles & access control (Forma platform)
// ---------------------------------------------------------------------------

/** Platform roles, from most to least privileged. */
export type Role = 'super_admin' | 'admin' | 'coach' | 'client';

/** Lifecycle state of an account. Only `active` accounts may use the platform. */
export type AccountStatus = 'active' | 'suspended' | 'pending' | 'disabled';

/**
 * Granular permission keys. Each role implies a baseline set (see
 * `ROLE_PERMISSIONS` in src/services/auth/roles.ts); `UserRecord.permissions`
 * can grant extras beyond that baseline. Firestore rules enforce the same set.
 */
export type Permission =
  | 'users.read' // list/read other users' identity docs
  | 'users.create' // provision new accounts
  | 'users.manageRoles' // change role / permissions on other users
  | 'users.manageStatus' // suspend / disable / reactivate accounts
  | 'coaches.assign' // create/transfer coach⇄client relationships
  | 'clients.readAll' // read ANY client's clientData (admin oversight)
  | 'clients.writeAll' // write plans/notes to ANY client
  | 'flags.manage' // manage the featureFlags collection
  | 'audit.read'; // read adminAuditLogs

/**
 * Identity / access-control document at `users/{uid}`. Deliberately separate
 * from `UserProfile` (the fitness profile, which lives at
 * `clientData/{uid}/profile`). A user can never elevate their own role,
 * permissions, or status — that is enforced in firestore.rules.
 */
export interface UserRecord {
  id: string; // == Firebase Auth uid
  email: string;
  displayName: string;
  phone?: string; // contact number, collected at sign-up / account creation
  photoUrl?: string; // avatar (Bunny CDN url); falls back to initials
  timezone?: string; // IANA tz (coach-set; display-only for now)
  mustChangePassword?: boolean; // set when an admin/coach provisions with a temp password
  role: Role;
  accountStatus: AccountStatus;
  permissions: Permission[];
  featureFlags: Record<string, boolean>;
  createdBy: string; // actor uid, or 'self' for open sign-up
  assignedCoachId?: string; // clients managed by a coach
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Client onboarding assessment
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female';
export type AssessmentGoal =
  | 'fat_loss'
  | 'muscle_gain'
  | 'recomp'
  | 'strength'
  | 'general_fitness'
  | 'endurance';
export type OccupationType = 'desk' | 'moderate' | 'physical';
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingLocation = 'commercial_gym' | 'home_gym' | 'both';
export type InjuryArea = 'shoulder' | 'elbow' | 'wrist' | 'back' | 'knee' | 'ankle';
export type FoodBudget = 'low' | 'medium' | 'high';
export type AssessmentChallenge =
  | 'consistency'
  | 'time'
  | 'hunger'
  | 'eating_out'
  | 'travel'
  | 'motivation'
  | 'other';

export interface AssessmentBasic {
  fullName: string;
  dateOfBirth: string; // ISO YYYY-MM-DD
  age: number; // derived from dateOfBirth on submit
  gender: Gender;
  heightCm: number;
  weightKg: number;
}
export interface AssessmentGoals {
  primaryGoal: AssessmentGoal;
  /** Optional ordered priorities (most → least important). */
  goalPriorities?: AssessmentGoal[];
  targetWeightKg?: number;
  deadlineMonths?: number;
}
export interface AssessmentLifestyle {
  occupation: OccupationType;
  sleepHours: number; // 4–12
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number; // 1–7
}
export interface AssessmentTraining {
  level: TrainingLevel;
  location: TrainingLocation;
}
export interface AssessmentHealth {
  injuries: InjuryArea[];
  noInjuries: boolean;
  injuryDetails?: string;
  hasMedicalConditions: boolean;
  medicalDetails?: string;
}
export interface AssessmentNutrition {
  likes: string[];
  dislikes: string[];
  allergies: string[];
  /** Foods the client won't give up — helps build a realistic plan. */
  mustHaveFoods: string[];
  budget: FoodBudget;
  mealsPerDay: number; // 2–6
}
export interface AssessmentMotivation {
  biggestChallenge: AssessmentChallenge;
  commitmentLevel: number; // 1–10
}
export interface AssessmentPhotos {
  front?: string;
  side?: string;
  back?: string;
}

/**
 * Lifecycle of the onboarding assessment. `not_started` = no doc; `in_progress`
 * = client saved a draft; `submitted` = client finished; `reviewed` = the coach
 * has reviewed it. Legacy docs (no `status`, `completed:true`) read as
 * `submitted` via `assessmentStatus()` in src/lib/assessment.ts.
 */
export type AssessmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review';

/**
 * Mandatory client onboarding assessment, stored in structured sections at
 * `clientData/{clientId}/profile/assessment`. Client-owned (writes their own
 * until the coach marks it reviewed); the assigned coach + admins read it, and
 * the assigned coach writes the review fields (coachNotes / reviewed / reset).
 */
export interface ClientAssessment {
  basic: AssessmentBasic;
  goals: AssessmentGoals;
  lifestyle: AssessmentLifestyle;
  training: AssessmentTraining;
  health: AssessmentHealth;
  nutrition: AssessmentNutrition;
  motivation: AssessmentMotivation;
  progressPhotos: AssessmentPhotos;
  /** 0–100; set to 100 on completion (room for partial-completion UI later). */
  completionPercentage: number;
  completed: boolean;
  completedAt: number | null;
  updatedAt: number;
  // ---- review loop (additive; legacy docs derive status from `completed`) ----
  status?: AssessmentStatus;
  submittedAt?: number | null;
  /** Coach review metadata. */
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  /** Free-text notes the coach records while reviewing. */
  coachNotes?: string;
}

export type CoachClientStatus = 'active' | 'pending' | 'ended';

/** Coaching subscription lifecycle (stored on the coach⇄client relationship). */
export type SubscriptionStatus = 'active' | 'frozen' | 'ended';

/**
 * A client's coaching subscription, kept on the `coachClients/{coachId__clientId}`
 * relationship (coach-owned, client-readable). A freeze pauses the term and
 * extends `endAt` by the frozen duration. `status` is the coach's explicit state;
 * use `effectiveSubscriptionStatus()` to fold in the current date.
 */
export interface Subscription {
  startAt: number;
  endAt: number;
  months?: number; // original term, for display
  price?: number; // amount the coach charges for this term (coach-set, client-read)
  currency?: string; // e.g. "EGP", "USD" — coach-set
  status: SubscriptionStatus;
  frozenFrom?: number | null;
  frozenUntil?: number | null;
  note?: string; // coach note (e.g. why frozen)
  updatedAt: number;
}

/**
 * An archived subscription term, kept on the relationship's `subscriptionHistory`
 * so coach and client can see how long / how much the client has subscribed. A
 * prior term is archived when the coach starts a new term (different start date).
 */
export interface SubscriptionPeriod {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  status: SubscriptionStatus; // terminal state when archived (typically 'ended')
  endedAt: number; // when this period was closed/archived
}

/** Coach⇄client link. Doc id is deterministic: `${coachId}__${clientId}`. */
export interface CoachClientRelationship {
  id: string;
  coachId: string;
  clientId: string;
  status: CoachClientStatus;
  /** Coaching subscription term + freeze state (absent until the coach sets it). */
  subscription?: Subscription;
  /** Past subscription terms (newest pushed last), for the history view. */
  subscriptionHistory?: SubscriptionPeriod[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type FreezeRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

/**
 * A client-initiated request to freeze their subscription, at
 * `clientData/{clientId}/subscriptionRequest/current`. The client writes the
 * request (status `pending`/`cancelled`); the assigned coach writes the decision
 * (`accepted`/`rejected` + `coachNote`) and, on accept, applies the freeze.
 */
export interface FreezeRequest {
  id: string; // always 'current'
  clientId: string;
  from?: number | null;
  until?: number | null;
  reason: string;
  status: FreezeRequestStatus;
  requestedAt: number;
  decidedAt?: number | null;
  decidedBy?: string | null;
  coachNote?: string;
  updatedAt: number;
}

/** Best-effort audit record (client-written; immutable once created). */
export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  targetUserId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export type FeatureFlagScope = 'global' | 'coach' | 'client';

export interface FeatureFlag {
  id: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  targetId?: string; // uid the flag applies to when scope is 'coach' | 'client'
  updatedAt: number;
}

/** Which client-app screen a note/notification points at. */
export type NoteScreen = 'nutrition' | 'workout' | 'cardio' | 'progress' | 'measurements' | 'photos';

/**
 * The kind of entity a coach note is attached to. Notes are anchored by
 * (entityType, entityId) — NEVER by screen coordinates — so they render next to
 * the right item on any device/layout and survive UI redesigns.
 */
export type NoteEntityType =
  | 'meal'
  | 'food'
  | 'exercise'
  | 'workout_day'
  | 'cardio_session'
  | 'measurement'
  | 'weight_entry'
  | 'progress_photo'
  | 'checkin';

/** A coach's note about a client. Lives at `clientData/{clientId}/coachNotes`. */
export interface CoachNote {
  id: string;
  clientId: string;
  authorId: string;
  authorRole: Role;
  body: string;
  /** Distinguishes one-off notes from broadcast announcements. */
  kind?: 'note' | 'announcement';
  // ---- entity anchoring (all optional; legacy/general notes have none) ----
  /** Client screen the note belongs to (drives notification deep-link). */
  screen?: NoteScreen;
  /** Day the note refers to (for day-scoped entities). */
  date?: DayKey;
  /** What the note is attached to. */
  entityType?: NoteEntityType;
  /** Stable id of the anchored entity (meal id, exercise id, photo id, measurement key…). */
  entityId?: string;
  /** Reserved for a future visual-placement hint; unused today. */
  anchor?: { placement?: 'inline' | 'above' | 'below' | 'badge' };
  createdAt: number;
  updatedAt: number;
  dirty?: boolean;
}

/** Why a notification was raised. The first group targets the client, the second the coach. */
export type NotificationType =
  | 'coach_note'
  | 'plan_assigned'
  | 'targets_updated'
  | 'subscription_updated'
  | 'freeze_decided'
  | 'measurement_added'
  | 'assessment_reviewed'
  | 'freeze_requested'
  | 'assessment_submitted'
  | 'checkin_requested'
  | 'checkin_submitted'
  | 'checkin_reviewed'
  | 'message_received';

/**
 * An in-app notification. Lives at `clientData/{clientId}/notifications/{id}` and
 * is written by whichever party acted (coach or client) — `forRole` says who
 * should see it. Read-state lives here (`seenAt`). The deep-link target mirrors
 * the note anchoring fields so tapping a notification jumps to the exact place.
 */
export interface AppNotification {
  id: string;
  clientId: string;
  forRole: 'client' | 'coach';
  type: NotificationType;
  /** Short preview text; the title is derived from `type` via i18n at render time. */
  body?: string;
  // ---- deep-link target ----
  screen?: NoteScreen;
  date?: DayKey;
  entityType?: NoteEntityType;
  entityId?: string;
  /** Explicit fallback route when there's no screen/entity mapping. */
  route?: string;
  seenAt?: number | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** Weekly check-in lifecycle: coach requests → client submits → coach reviews. */
export type CheckInStatus = 'requested' | 'submitted' | 'reviewed';

/**
 * One weekly check-in, at `clientData/{clientId}/checkIns/{weekStart}` (one per
 * ISO week; the doc id IS the weekStart date). The coach creates it (`requested`),
 * the client fills + submits it once (`submitted`), and the coach reviews it with
 * feedback (`reviewed`). Online read (React Query) — not in the local SyncEngine.
 */
export interface WeeklyCheckIn {
  id: string; // == weekStart (YYYY-MM-DD, Monday)
  clientId: string;
  coachId: string;
  weekStart: string; // YYYY-MM-DD (Mon)
  weekEnd: string; // YYYY-MM-DD (Sun)
  status: CheckInStatus;
  submittedAt?: number;
  reviewedAt?: number;
  currentWeight?: number; // kg, decimal
  adherenceTraining?: number; // 0..100
  adherenceNutrition?: number; // 0..100
  hungerLevel?: number; // 1..10
  energyLevel?: number; // 1..10
  sleepQuality?: number; // 1..10
  notes?: string;
  progressPhotos: { front?: string; side?: string; back?: string }; // Bunny CDN urls
  coachFeedback?: string;
  createdAt: number;
  updatedAt: number;
}

/** Optional category for a coach broadcast message (plain 1:1 chat omits it). */
export type MessageCategory = 'message' | 'announcement' | 'offer' | 'reminder' | 'update';

/**
 * A single chat message in the 1:1 coach⇄client thread at
 * `clientData/{clientId}/messages/{id}`. Both parties read+write. `seenAt` is set
 * when the OTHER party opens the thread (Sent → Seen). Broadcasts are normal
 * messages fanned into each client's thread with `broadcast: true` + a category.
 */
/** A CDN-hosted attachment on a message (image / video / document). */
export interface MessageAttachment {
  url: string;
  kind: 'image' | 'video' | 'file';
  name?: string;
  size?: number;
}

export interface Message {
  id: string;
  clientId: string;
  fromUserId: string;
  fromRole: Role;
  body: string;
  attachment?: MessageAttachment;
  category?: MessageCategory;
  broadcast?: boolean;
  seenAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type PlanKind = 'workout' | 'nutrition';

/**
 * A plan a coach assigns to a client. Lives at
 * `clientData/{clientId}/workoutPlans` or `/nutritionPlans`. Kept intentionally
 * simple (title + description) so it's authorable on mobile; the client reads
 * these in their app.
 */
export interface AssignedPlan {
  id: string;
  clientId: string;
  kind: PlanKind;
  title: string;
  description: string;
  assignedBy: string;
  assignedAt: number;
  updatedAt: number;
}

/** One prescribed cardio session in a coach's cardio plan. */
export interface CardioSession {
  id: string;
  type: CardioType;
  durationMin: number;
  /** Free-text frequency, e.g. "3×/week" or "after every workout". */
  frequency: string;
  notes: string;
}

/** Coach-authored cardio plan at `clientData/{clientId}/plan/cardio`. */
export interface CardioPlan {
  id: string;
  name: string;
  sessions: CardioSession[];
  meta?: AssignedPlanMeta;
  updatedAt: number;
}

/** A coach's reusable plan template at top-level `planTemplates` (owned by coachId). */
export interface PlanTemplate {
  id: string;
  coachId: string;
  kind: PlanKind;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Coach-assigned daily targets. Singleton doc `current` at
 * `clientData/{clientId}/coachTargets`. The client app reads and applies these.
 */
export interface CoachTargets {
  id: string; // always 'current'
  clientId: string;
  waterMl?: number;
  steps?: number;
  cardioMin?: number;
  calories?: number;
  protein?: number;
  updatedBy: string;
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
  /** Coach-set number of warm-up sets (overrides the free-text `warmupSets`). */
  warmupSetCount?: number;
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
  /** Coach-assigned direct video URL (YouTube or file), shown to the client. */
  videoUrl?: string | null;
  // ---- Coach exercise-library fields (optional; used when authoring) -------
  /** Body part / category, e.g. "Chest", "Back". */
  category?: string;
  /** Equipment, e.g. "Barbell", "Dumbbell", "Machine", "Bodyweight". */
  equipment?: string;
  /** Free-form tags for search/filter. */
  tags?: string[];
  /** Coach progression guidance shown to the client. */
  progressionNotes?: string;
}

/** A logical block inside a workout day, e.g. Chest / Warm-up / Finisher. */
export type SectionKind = 'normal' | 'warmup' | 'working' | 'mobility' | 'finisher';
export interface WorkoutSection {
  id: string;
  title: string;
  kind: SectionKind;
  exerciseIds: string[];
}

export interface WorkoutDay {
  id: string;
  dayIndex: number;
  title: string;
  focus: string;
  /** Canonical flat ordered exercise list (always = `sections` flattened). */
  exerciseIds: string[];
  /** Optional section grouping (coach-authored). Absent on seed/legacy plans. */
  sections?: WorkoutSection[];
}

/**
 * Metadata on an assigned client plan that was created from a coach template.
 * The assigned plan is an independent SNAPSHOT — never live-linked to the
 * template. `isCustomized` flips true once the coach edits the assigned copy.
 */
export interface AssignedPlanMeta {
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  assignedAt: number;
  assignedBy: string;
  isCustomized: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  weeklyVolume?: Record<string, string>;
  meta?: AssignedPlanMeta;
  updatedAt: number;
}

export type WorkoutGoal = 'hypertrophy' | 'fat_loss' | 'strength' | 'beginner' | 'advanced' | 'custom';
export type SplitType = 'ppl' | 'upper_lower' | 'full_body' | 'bro_split' | 'custom';

/** A coach-owned reusable workout template at `coachAssets/{coachId}/workoutTemplates`. */
export interface WorkoutTemplate {
  id: string;
  coachId: string;
  name: string;
  goal: WorkoutGoal;
  splitType: SplitType;
  days: WorkoutDay[];
  exercises: Record<string, Exercise>;
  createdAt: number;
  updatedAt: number;
}

/** Coach-owned reusable food at `coachAssets/{coachId}/foods` (nutrition architecture). */
export interface LibraryFood extends FoodItem {
  category?: string;
  tags?: string[];
}

/**
 * A coach-owned group of interchangeable foods at `coachAssets/{coachId}/foodGroups`.
 * Attaching a group to a planned meal item snapshots its `foods` onto the item
 * as `allowedAlternatives` (the client swaps among them without changing the plan).
 */
export interface FoodGroup {
  id: string;
  coachId: string;
  name: string;
  foods: LibraryFood[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

/** How a logged meal item compares to the coach's plan (for adherence). */
export type SubstitutionSource = 'matched_plan' | 'approved_substitution' | 'client_custom_substitution';

/** Coach-owned reusable nutrition template at `coachAssets/{coachId}/nutritionTemplates`. */
export interface NutritionTemplate {
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
  // ---- approved alternatives (planned items only; snapshotted onto the plan) ----
  /** Provenance: the coach FoodGroup this item's alternatives were copied from. */
  allowedAlternativeGroupId?: string;
  /** Coach-approved swaps for this item, denormalized so the client can read them. */
  allowedAlternatives?: FoodItem[];
  /** Whether the client may swap this item for a free-text custom food. */
  allowCustomSubstitution?: boolean;
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
  meta?: AssignedPlanMeta;
  /** Coach policy governing client food substitutions for this plan. */
  substitutionPolicy?: SubstitutionPolicy;
  updatedAt: number;
}

/** Coach controls for whether/how the client may swap planned foods. */
export interface SubstitutionPolicy {
  allowClientSubstitutions: boolean;
  allowCustomFoods: boolean;
  requireCoachApproval: boolean;
}

/** The three plan kinds that can be versioned (cardio is not a `PlanKind`). */
export type PlanVersionKind = 'workout' | 'nutrition' | 'cardio';

/**
 * A point-in-time snapshot of one of a client's plans, stored at
 * `clientData/{clientId}/planVersions/{versionId}` (coach-owned, client reads).
 * The assigned `plan/{kind}` doc always equals the `active` version's snapshot —
 * that's the single source the client tracker reads.
 */
export interface PlanVersion {
  id: string;
  kind: PlanVersionKind;
  versionNumber: number;
  name: string;
  createdAt: number;
  createdBy: string;
  reason?: string;
  snapshot: WorkoutPlan | MealPlan | CardioPlan;
  active: boolean;
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
  /**
   * Adherence tag for each swapped item (keyed by the original planned item id):
   * whether it was an approved alternative or a custom food, and whether it's
   * flagged for coach review. Items with no entry are `matched_plan`.
   */
  substitutions?: Record<string, { source: Exclude<SubstitutionSource, 'matched_plan'>; pendingApproval?: boolean }>;
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
  /** Public Bunny CDN URL (set after a best-effort upload; lets the coach / other devices view it). */
  cdnUrl?: string;
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
