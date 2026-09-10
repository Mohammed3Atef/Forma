/**
 * Local (Mongo-era) mirror of the coach⇄client relationship types from
 * `src/types/index.ts` (`Subscription`, `SubscriptionPeriod`,
 * `CoachClientRelationship`, etc.). Deliberately duplicated rather than
 * imported from `src/` — see the note atop `api/_lib/types.ts` for why the
 * api/ ↔ src/ boundary is never crossed for anything but `@vercel/node`-safe
 * type-only imports from `api/_lib`.
 *
 * Kept in sync BY HAND with `src/types/index.ts` and with `firestore.rules`'
 * `coachClients` / `coachPlans` match blocks, the same discipline the project
 * already uses elsewhere.
 */

export type CoachClientStatus = 'active' | 'pending' | 'ended';

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'custom';

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'pending'
  | 'expired'
  | 'cancelled'
  | 'frozen'
  | 'ended';

export type TransferMode = 'fresh_start' | 'keep_plans';
export type TransferSubHandling = 'keep' | 'new' | 'expire';

/** A client's coaching subscription, kept on the `coachClients` relationship doc. */
export interface SubscriptionDoc {
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

/** An archived subscription term, pushed onto `subscriptionHistory` (newest last). */
export interface SubscriptionPeriodDoc {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  status: SubscriptionStatus;
  endedAt: number;
}

/** Coach⇄client link. `_id` is deterministic: `${coachId}__${clientId}`. */
export interface CoachClientDoc {
  _id: string;
  coachId: string;
  clientId: string;
  status: CoachClientStatus;
  subscription?: SubscriptionDoc;
  subscriptionHistory?: SubscriptionPeriodDoc[];
  /** Invite code that established the relationship (invite-driven self-claim). */
  inviteCode?: string;
  endedAt?: number;
  endedBy?: string;
  endReason?: 'released' | 'transferred' | 'unassigned';
  /** Transfer mode, when it ended (or started) because the client was transferred. */
  mode?: TransferMode;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * The subscription term a coach/admin picks when assigning an existing client
 * or resolving a transfer with a brand-new term. Mirrors
 * `ClientSubscriptionInput` from `src/services/platform/coachClientsApi.ts` —
 * a client is NEVER assigned without an explicit subscription state.
 */
export interface ClientSubscriptionInput {
  status: SubscriptionStatus;
  months?: number;
  days?: number;
  trialDays?: number;
  price?: number;
  currency?: string;
  planName?: string;
  billingCycle?: BillingCycle;
  startAt?: number;
}

/**
 * Layer-A coach plan doc (`coachPlans/{coachId}`), owned/created by a parallel
 * module this same migration. We only ever READ it here (to enforce the
 * per-coach client cap) and increment/decrement `activeClientCount` — never
 * touch `plan`/`status`/`maxClients`/etc.
 */
export interface CoachPlanDoc {
  _id: string; // == coachId
  plan?: string;
  status?: string;
  maxClients?: number;
  activeClientCount?: number;
  createdAt?: number;
  updatedAt?: number;
}
