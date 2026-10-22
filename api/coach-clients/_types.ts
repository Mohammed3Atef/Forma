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
  /**
   * B3.8 (owner: fixed-day terms, Fix C, payments). Absent on terms written before B3.8, which
   * keep working from `startAt` / `endAt` alone (never migrated):
   *  - `termId` — the economic term's stable id; corrections keep it, a renewal starts a new one,
   *    and recorded payments point at it.
   *  - `startDate` / `endDate` — the term's calendar days `[startDate, endDate)` in `zone`
   *    (`endDate` EXCLUSIVE: 30 days from 1 Oct covers 1–30 Oct, the next term starts 31 Oct).
   *    `startAt` / `endAt` are the first instants of those days in `zone` (`endAt` may differ from
   *    `endDate` only once the term was ended early — `end` stops access at that instant).
   *  - `days` — the booked length in days (1 month = 30 days); extensions and freeze
   *    compensation move `endDate` but never `days`.
   *  - `zone` — the IANA zone the dates are anchored in (the coach device's zone when the term
   *    was set; `Africa/Cairo` when none was sent). Never the server's own zone.
   */
  termId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  zone?: string;
}

/** The dated fields of a term, as recorded in a subscription-change event. */
export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  startAt: number;
  endAt: number;
  frozenFrom: number | null;
  frozenUntil: number | null;
  freezeCredit: number | null;
  /** B3.8: the economic fields too, so a corrected term's earlier versions stay auditable. */
  termId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  months?: number;
  price?: number;
  planName?: string;
}

/**
 * B3.8 (Fix C): what a term change MEANS — never inferred from its dates.
 *  - `newTerm`  the client's first term (no term yet, or a pending one).
 *  - `renew`    the NEXT term: a running term is renewed from its end; a lapsed one from the day
 *               the coach picks. The current term moves to `subscriptionHistory` with its real end.
 *  - `correct`  the CURRENT term was set wrong (dates, length, price) or its package changes: the
 *               same economic term (same `termId`), edited in place; the earlier version stays in
 *               the event's `before` snapshot only — never a second term.
 * `setTerm` / `setPrice` are the pre-B3.8 operations; the server no longer accepts them.
 */
export type SubscriptionIntent = 'newTerm' | 'renew' | 'correct';

/**
 * B3.0.1: one auditable subscription change (owner: "record an auditable
 * subscription-change event"). Appended to `subscriptionEvents` in the SAME
 * update as the change it describes, newest last, capped. Never a payment
 * record — the ledger stays `subscriptionHistory`.
 */
export interface SubscriptionEventDoc {
  at: number;
  op: SubscriptionIntent | 'setTerm' | 'setPrice' | 'freeze' | 'unfreeze' | 'end' | 'cancel' | 'extend';
  actorRole: 'coach' | 'admin';
  /** B3.8: `correct` only — a plain correction, or the client changing package mid-term. */
  reason?: 'correction' | 'changePackage';
  /** B3.8: the caller's idempotency key — a retried change with the same key is applied once. */
  requestId?: string;
  before: SubscriptionSnapshot | null;
  after: SubscriptionSnapshot;
  /**
   * `setTerm` only: the new term starts before today over time that was not
   * paid (the old term had lapsed or ended, or the start moved earlier) — logs
   * the client could not sync for those days become syncable (owner, B3.0.1).
   */
  backdated?: true;
}

/**
 * An archived subscription term, pushed onto `subscriptionHistory` (newest last). Since B3.8 only
 * a RENEWAL archives (`archivedBy: 'renew'`), with the term's real end. Entries without
 * `archivedBy` were archived by the pre-B3.8 `setTerm`, which also archived corrections — they
 * are kept as they are (clean launch: no back-fill).
 */
export interface SubscriptionPeriodDoc {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  status: SubscriptionStatus;
  /** When the term was archived (the renewal's time). */
  endedAt: number;
  /** B3.8 — see `SubscriptionDoc`. */
  termId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  zone?: string;
  planName?: string;
  archivedBy?: 'renew';
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
  /** B3.8: the first day (`YYYY-MM-DD`) in `zone`; preferred over `startAt`. */
  startDate?: string;
  /** B3.8: the coach device's IANA zone the dates are meant in. */
  zone?: string;
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
