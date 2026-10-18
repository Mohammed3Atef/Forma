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
  /**
   * B3.0.1 / B3-S07 (F-C): the compensation in ms (`frozenUntil - frozenFrom`)
   * a scheduled freeze added to `endAt`. Its presence marks the freeze as
   * scheduled (effective only inside its window). Absent on freezes stored
   * before B3.0.1, which keep their original meaning (never migrated).
   */
  freezeCredit?: number | null;
  note?: string;
  updatedAt: number;
}

/** The dated fields of a term, as recorded in a subscription-change event. */
export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  startAt: number;
  endAt: number;
  frozenFrom: number | null;
  frozenUntil: number | null;
  freezeCredit: number | null;
}

/**
 * B3.0.1: one auditable subscription change (owner: "record an auditable
 * subscription-change event"). Appended to `subscriptionEvents` in the SAME
 * update as the change it describes, newest last, capped. Never a payment
 * record — the ledger stays `subscriptionHistory`.
 */
export interface SubscriptionEventDoc {
  at: number;
  op: 'setTerm' | 'setPrice' | 'freeze' | 'unfreeze' | 'end' | 'cancel' | 'extend';
  actorRole: 'coach' | 'admin';
  before: SubscriptionSnapshot | null;
  after: SubscriptionSnapshot;
  /**
   * `setTerm` only: the new term starts before today over time that was not
   * paid (the old term had lapsed or ended, or the start moved earlier) — logs
   * the client could not sync for those days become syncable (owner, B3.0.1).
   */
  backdated?: true;
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
  /** B3.0.1: audit trail of subscription changes (see `SubscriptionEventDoc`). Absent on older docs. */
  subscriptionEvents?: SubscriptionEventDoc[];
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
  /**
   * B3.4 / B3-S13: earlier stints of this same coach ⇄ client pair (the document id is
   * `coachId__clientId`, so a client who returns to a coach reuses it). When a relationship is
   * re-activated, the whole previous stint — dates, how it ended, its term, archived terms and
   * audit trail — moves here and the active document starts clean. Oldest first.
   */
  previousStints?: PreviousStintDoc[];
}

/** One archived stint of a re-activated relationship (B3-S13). Every field of the stint as it ended. */
export type PreviousStintDoc = Omit<CoachClientDoc, '_id' | 'coachId' | 'clientId' | 'previousStints'> & { archivedAt: number };

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
  endsAt?: number | null;
  activeClientCount?: number;
  createdAt?: number;
  updatedAt?: number;
}
