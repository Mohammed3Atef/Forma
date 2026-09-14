/**
 * Backend-local type mirror of the Firestore-era coaching/subscription model
 * (`src/types/index.ts`'s CoachClientRelationship/Subscription/CoachPlan
 * shapes) — deliberately duplicated here rather than imported from `src/`,
 * same discipline as `api/_lib/types.ts`. Only the fields the admin oversight
 * routes actually read/write are included.
 *
 * `CoachClientDoc` itself is the one exception: it's the same `coachClients`
 * Mongo document owned/exported canonically by `api/coach-clients/_types.ts`,
 * so it's re-exported from there (type-only import — no runtime dependency
 * on the coach-clients module) instead of being hand-mirrored a second time.
 */
import type { Role } from '../../_lib/types.js';
import type { CoachClientDoc } from '../../coach-clients/_types.js';

export type { CoachClientDoc };

export type SubscriptionStatus = 'trial' | 'active' | 'pending' | 'expired' | 'cancelled' | 'frozen' | 'ended';
export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'custom';

export interface Subscription {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  planName?: string;
  billingCycle?: BillingCycle;
  cancelledAt?: number | null;
  status: SubscriptionStatus;
  frozenFrom?: number | null;
  frozenUntil?: number | null;
  note?: string;
  updatedAt: number;
}

export type CoachPlanTier = string;
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';

/**
 * Mongo doc for `coachPlans` (Layer-A coach subscription to Forma itself),
 * `_id` == coachId — there is deliberately NO separate `coachId` field stored
 * on the document itself (only the derived `PublicCoachPlan` API-response
 * shape in `api/coach-plans/_data.ts` synthesizes one via `{coachId: _id,
 * ...rest}`). A stray `coachId` field on THIS type previously caused a real
 * bug: `adminCoaches.list` built its plan lookup by (nonexistent) `p.coachId`
 * instead of `p._id`, silently rendering every coach's tier/state/maxClients
 * as null/"none" in the admin Coaches list.
 */
export interface CoachPlanDoc {
  _id: string;
  plan: CoachPlanTier;
  status: CoachPlanStatus;
  maxClients: number;
  startedAt: number;
  endsAt: number | null;
  trialNotified?: { d7?: boolean; d5?: boolean; d3?: boolean; d1?: boolean };
  activeClientCount?: number;
  history?: Array<Record<string, unknown>>;
  createdAt: number;
  updatedAt: number;
}

/** Mongo doc for `coachPlanTiers` (admin-editable pricing/limits per tier), `_id` == tier key. */
export interface CoachPlanTierDoc {
  _id: string;
  key: string;
  label?: string;
  maxClients: number;
  priceMonthly: number;
  currency?: string;
  order?: number;
  active?: boolean;
  archived?: boolean;
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Mongo doc for `adminAuditLogs` — append-only, immutable. `_id` is a generated id. */
export interface AuditLogDoc {
  _id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  targetUserId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}
