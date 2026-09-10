/**
 * Local (api/client-owned) Mongo document shapes for everything that used to
 * live under Firestore's recursive `clientData/{clientId}/{subcollection}/{docId}`
 * namespace. Deliberately NOT added to the shared `api/_lib/types.ts` — that
 * file is owned by parallel work on the auth module. Keep field names aligned
 * with `src/types/index.ts` (the frontend types) by hand.
 */

import type { Role } from '../../_lib/types.js';

// ---------------------------------------------------------------------------
// clientProfiles — singleton per client. Two logical sub-resources bundled
// into one Mongo doc: `profile` (mirrors Firestore's `profile/main`, the
// derived UserProfile) and `assessment` (mirrors `profile/assessment`, the
// onboarding ClientAssessment with its coach-review workflow).
// ---------------------------------------------------------------------------

export type Goal = 'muscle_gain' | 'fat_loss' | 'recomp' | 'maintenance' | 'strength';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Locale = 'en' | 'ar' | 'ar-eg';

export interface ClientProfileFields {
  id: string; // == clientId
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

/** Lifecycle of the onboarding assessment — mirrors `AssessmentStatus` in src/types. */
export type AssessmentStatus = 'in_progress' | 'submitted' | 'reviewed' | 'updated_after_review';

/**
 * The assessment's structured sections are authored/rendered entirely by the
 * frontend (src/types' AssessmentBasic/Goals/Lifestyle/Training/Health/
 * Nutrition/Motivation/Photos); the backend stores them opaquely except for
 * `basic.fullName`, which it reads once on submit to sync `users.displayName`.
 */
export interface ClientAssessmentFields {
  basic?: Record<string, unknown> & { fullName?: string };
  goals?: Record<string, unknown>;
  lifestyle?: Record<string, unknown>;
  training?: Record<string, unknown>;
  health?: Record<string, unknown>;
  nutrition?: Record<string, unknown>;
  motivation?: Record<string, unknown>;
  progressPhotos?: Record<string, unknown>;
  completionPercentage?: number;
  completed?: boolean;
  completedAt?: number | null;
  status?: AssessmentStatus;
  submittedAt?: number | null;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  coachNotes?: string;
  updatedAt: number;
}

export interface ClientProfileDoc {
  _id: string; // == clientId
  clientId: string;
  profile?: ClientProfileFields;
  assessment?: ClientAssessmentFields;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// clientSettings — singleton per client, fully client-owned (coach/admin may
// only read via the recursive clientData read rule; there is no coach write).
// ---------------------------------------------------------------------------

export interface ClientSettingsDoc {
  _id: string; // == clientId
  clientId: string;
  settings: Record<string, unknown>;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// clientWorkoutPlans / clientNutritionPlans / clientCardioPlans — coach-authored
// singleton plan docs (mirrors Firestore's `clientData/{clientId}/plan/{kind}`,
// which is in `isCoachOwnedColl` — client read-only, coach/admin writeAll).
// The nested plan structure (days/exercises/meals/sessions/…) is authored by
// the frontend; stored opaquely here beyond the few fields the backend touches.
// ---------------------------------------------------------------------------

export interface ClientPlanDoc {
  _id: string; // == clientId
  clientId: string;
  id: string;
  name: string;
  updatedAt: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// planVersions — many docs per client (history), coach-owned.
// ---------------------------------------------------------------------------

export type PlanVersionKind = 'workout' | 'nutrition' | 'cardio';

export interface PlanVersionDoc {
  _id: string;
  clientId: string;
  kind: PlanVersionKind;
  versionNumber: number;
  name: string;
  createdAt: number;
  createdBy: string;
  reason?: string;
  snapshot: Record<string, unknown>;
  active: boolean;
}

// ---------------------------------------------------------------------------
// coachNotes — many docs per client, coach-owned.
// ---------------------------------------------------------------------------

export type NoteScreen = 'nutrition' | 'workout' | 'cardio' | 'progress' | 'measurements' | 'photos';
export type NoteEntityType =
  | 'meal'
  | 'food'
  | 'water'
  | 'supplement'
  | 'exercise'
  | 'workout_day'
  | 'cardio_session'
  | 'measurement'
  | 'weight_entry'
  | 'progress_photo'
  | 'checkin';

export interface CoachNoteDoc {
  _id: string;
  clientId: string;
  authorId: string;
  authorRole: Role;
  body: string;
  kind?: 'note' | 'announcement';
  screen?: NoteScreen;
  date?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// coachTargets — singleton per client, coach-owned.
// ---------------------------------------------------------------------------

export interface CoachTargetsDoc {
  _id: string; // == clientId, always logically "current"
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
// checkIns — many docs per client (one per ISO week), coach-owned EXCEPT the
// client may update their OWN doc while status is still 'requested'.
// ---------------------------------------------------------------------------

export type CheckInStatus = 'requested' | 'submitted' | 'reviewed';

export interface WeeklyCheckInDoc {
  _id: string; // == `${clientId}__${weekStart}`
  clientId: string;
  coachId: string;
  weekStart: string;
  weekEnd: string;
  status: CheckInStatus;
  submittedAt?: number;
  reviewedAt?: number;
  currentWeight?: number;
  adherenceTraining?: number;
  adherenceNutrition?: number;
  hungerLevel?: number;
  energyLevel?: number;
  sleepQuality?: number;
  notes?: string;
  progressPhotos: { front?: string; side?: string; back?: string };
  coachFeedback?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// measurementLogs — many docs per client (one per day). NOT coach-owned, but
// a dedicated rule ALSO grants the assigned coach / admin(writeAll) write.
// ---------------------------------------------------------------------------

export interface MeasurementLogDoc {
  _id: string; // == `${clientId}__${date}`
  clientId: string;
  date: string;
  values: Record<string, number>;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// notifications — many docs per client; either party may write (client writes
// coach-bound alerts, coach writes client-bound alerts; both may mark seen).
// ---------------------------------------------------------------------------

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
  | 'message_received'
  | 'trial_expiring'
  | 'plan_change_requested'
  | 'plan_decided'
  | 'coach_assigned'
  | 'client_released';

export interface AppNotificationDoc {
  _id: string;
  clientId: string;
  forRole: 'client' | 'coach';
  type: NotificationType;
  body?: string;
  screen?: NoteScreen;
  date?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  route?: string;
  seenAt?: number | null;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// subscriptionRequests — singleton per client (freeze request). Client
// creates/cancels their own (generic client-own write); coach/admin decides
// (dedicated write rule).
// ---------------------------------------------------------------------------

export type FreezeRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface FreezeRequestDoc {
  _id: string; // == clientId, always logically "current"
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

// ---------------------------------------------------------------------------
// Raw fitness logs — workoutLogs / nutritionLogs / weightLogs are one-per-day
// (client-owned only, no coach write); cardioLogs allows several sessions per
// day. All indexed by `clientId` + `date`.
// ---------------------------------------------------------------------------

export type SetType = 'warmup' | 'working';

export interface SetLogFields {
  setIndex: number;
  type: SetType;
  targetReps: string;
  actualReps: number | null;
  weightKg: number | null;
  rpe: number | null;
  done: boolean;
}

export interface ExerciseLogFields {
  exerciseId: string;
  sets: SetLogFields[];
  done: boolean;
}

export interface WorkoutLogDoc {
  _id: string; // == `${clientId}__${date}`
  clientId: string;
  date: string;
  dayId: string;
  startedAt: number | null;
  endedAt: number | null;
  durationSec: number;
  exercises: ExerciseLogFields[];
  finished: boolean;
  updatedAt: number;
}

export interface NutritionLogDoc {
  _id: string; // == `${clientId}__${date}`
  clientId: string;
  date: string;
  mealsEaten: Record<string, boolean>;
  supplementsTaken: Record<string, boolean>;
  customFoods: Record<string, unknown>[];
  itemOverrides: Record<string, Record<string, unknown> | null>;
  substitutions?: Record<string, { source: 'approved_substitution' | 'client_custom_substitution'; pendingApproval?: boolean }>;
  extraItems: Record<string, Record<string, unknown>[]>;
  waterMl: number;
  creatineTaken: boolean;
  updatedAt: number;
}

export type CardioType = 'walking' | 'treadmill' | 'running' | 'cycling' | 'other';

export interface CardioLogDoc {
  _id: string; // client-provided id, or server-generated
  clientId: string;
  date: string;
  type: CardioType;
  durationSec: number;
  distanceKm: number | null;
  caloriesBurned: number | null;
  steps: number | null;
  updatedAt: number;
}

export interface WeightLogDoc {
  _id: string; // == `${clientId}__${date}`
  clientId: string;
  date: string;
  weightKg: number;
  updatedAt: number;
}
