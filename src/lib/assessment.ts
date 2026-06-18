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
