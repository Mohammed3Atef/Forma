import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `CoachPlan` /
 * `CoachPlanChangeRequest` + the Firestore logic in
 * `src/services/platform/coachPlanApi.ts` / `coachTrialApi.ts`, ported to
 * top-level Mongo collections:
 *  - `coachPlans` — `_id` = the coach's user id (was `coachPlans/{coachId}`).
 *  - `coachPlanChangeRequests` — `_id` = the coach's user id (was the
 *    singleton subcollection doc `coachPlans/{coachId}/planChangeRequest/current`).
 *
 * Layer A only — the coach's own subscription to Forma. Distinct from the
 * per-client Subscription (Layer B) which lives elsewhere.
 */

export type CoachPlanTierKey = string;
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';

/** One entry in a plan's change history (newest pushed last). Mirrors `PlanHistoryEntry`. */
export interface PlanHistoryEntry {
  at: number;
  action: string; // 'tier' | 'maxClients' | 'status' | 'endsAt' | 'request.accepted' | 'request.rejected'
  detail?: string;
  by?: string; // actor id
}

export interface CoachPlanDoc {
  _id: string; // == coachId
  plan: CoachPlanTierKey;
  status: CoachPlanStatus;
  maxClients: number; // trial = TRIAL_MAX_CLIENTS
  startedAt: number;
  endsAt: number | null;
  /** Expiry-reminder bookkeeping (trial OR paid term) — each flag fires its reminder once. */
  trialNotified?: { d7?: boolean; d5?: boolean; d3?: boolean; d1?: boolean };
  /** Maintained client-usage counter. */
  activeClientCount?: number;
  history?: PlanHistoryEntry[];
  createdAt: number;
  updatedAt: number;
}

/** The exact shape returned to the frontend — matches `CoachPlan` field-for-field. */
export type PublicCoachPlan = Omit<CoachPlanDoc, '_id'> & { coachId: string };

export function toPublicCoachPlan(doc: CoachPlanDoc): PublicCoachPlan {
  const { _id, ...rest } = doc;
  return { coachId: _id, ...rest };
}

export type PlanRequestStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export interface CoachPlanChangeRequestDoc {
  _id: string; // == coachId (singleton, was doc id 'current' under the coach)
  coachId: string;
  requestedTier?: CoachPlanTierKey;
  requestedMaxClients?: number;
  reason: string;
  status: PlanRequestStatus;
  requestedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  adminNote?: string;
  updatedAt: number;
}

/** The exact shape returned to the frontend — matches `CoachPlanChangeRequest` field-for-field. */
export type PublicCoachPlanChangeRequest = Omit<CoachPlanChangeRequestDoc, '_id'> & { id: 'current' };

export function toPublicChangeRequest(doc: CoachPlanChangeRequestDoc): PublicCoachPlanChangeRequest {
  const { _id: _omit, ...rest } = doc;
  return { id: 'current', ...rest };
}

export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

export async function coachPlanChangeRequestsCol(): Promise<Collection<CoachPlanChangeRequestDoc>> {
  return (await getDb()).collection<CoachPlanChangeRequestDoc>('coachPlanChangeRequests');
}

/** Trial defaults — mirrored in firestore.rules today; keep in sync by hand. */
export const TRIAL_MAX_CLIENTS = 10;
export const TRIAL_DURATION_DAYS = 15;
/** Default renewal cycle for paid tiers (renewals are manual — no payment gateway). */
export const PAID_TERM_DAYS = 30;
export const DAY_MS = 86_400_000;
