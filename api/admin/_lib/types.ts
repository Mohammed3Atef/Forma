/**
 * Backend-local type mirror of the Firestore-era coaching/subscription model
 * (`src/types/index.ts`'s CoachClientRelationship/Subscription/CoachPlan
 * shapes) — deliberately duplicated here rather than imported from `src/`,
 * same discipline as `api/_lib/types.ts`. Only the fields the admin oversight
 * routes actually read/write are included.
 */
import type { Role } from '../../_lib/types';

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

export type CoachClientStatus = 'active' | 'pending' | 'ended';
export type TransferMode = 'fresh_start' | 'keep_plans';

/** Mongo doc for `coachClients`, `_id` == `${coachId}__${clientId}` (owned by a parallel migration agent; read-only here). */
export interface CoachClientDoc {
  _id: string;
  coachId: string;
  clientId: string;
  status: CoachClientStatus;
  subscription?: Subscription;
  inviteCode?: string;
  endedAt?: number;
  endedBy?: string;
  endReason?: 'released' | 'transferred' | 'unassigned';
  mode?: TransferMode;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type CoachPlanTier = string;
export type CoachPlanStatus = 'active' | 'expired' | 'suspended';

/** Mongo doc for `coachPlans` (Layer-A coach subscription to Forma itself), `_id` == coachId. */
export interface CoachPlanDoc {
  _id: string;
  coachId: string;
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
