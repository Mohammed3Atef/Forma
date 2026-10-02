import type { AssessmentStatus, ClientAssessment } from '@/types';

/**
 * Derive the assessment lifecycle status, tolerating legacy docs that predate
 * the explicit `status` field: a doc with `completed:true` reads as `submitted`,
 * a doc without it reads as `in_progress`, and a missing doc is `not_started`.
 */
export function assessmentStatus(a: ClientAssessment | null | undefined): AssessmentStatus {
  if (!a) return 'not_started';
  return a.status ?? (a.completed ? 'submitted' : 'in_progress');
}

/** Whether the assessment is far enough along to unlock the client dashboard. */
export function assessmentSubmitted(a: ClientAssessment | null | undefined): boolean {
  const s = assessmentStatus(a);
  return s === 'submitted' || s === 'reviewed' || s === 'updated_after_review';
}

/**
 * Fill every section an assessment record may be missing. Records written by
 * older app versions / imports can lack whole sections (e.g. only
 * `basic.fullName`), and every view reads `a.health.*`, `a.nutrition.*` etc.
 * directly — a missing section crashed the coach plan editors and the
 * assessment views. Applied once at the fetch boundary so no view has to guard.
 * Missing health data is rendered as "no injuries / no conditions" rather than
 * raising a false injury flag.
 */
export function normalizeAssessment<T extends ClientAssessment | null | undefined>(a: T): T {
  if (!a) return a;
  const x = a as Partial<ClientAssessment> & Record<string, unknown>;
  return {
    ...x,
    basic: { fullName: '', dateOfBirth: '', age: 0, gender: 'male', heightCm: 0, weightKg: 0, ...(x.basic ?? {}) },
    goals: { primaryGoal: 'fat_loss', goalPriorities: [], ...(x.goals ?? {}) },
    lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'moderate', trainingDaysPerWeek: 3, ...(x.lifestyle ?? {}) },
    training: { level: 'beginner', location: 'commercial_gym', ...(x.training ?? {}) },
    health: { injuries: [], noInjuries: true, hasMedicalConditions: false, ...(x.health ?? {}) },
    nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3, ...(x.nutrition ?? {}) },
    motivation: { biggestChallenge: 'consistency', commitmentLevel: 7, ...(x.motivation ?? {}) },
    progressPhotos: x.progressPhotos ?? {},
  } as unknown as T;
}
