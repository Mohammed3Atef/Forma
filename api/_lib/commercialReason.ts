/**
 * Stable, machine-readable reason for a refusal, carried as the `cause` of a
 * TRPCError and surfaced to clients as `error.data.reason` by the tRPC error
 * formatter (api/_trpc/trpc.ts). Lets the UI distinguish SUBSCRIPTION_EXPIRED
 * from CLIENT_CAPACITY_REACHED etc. without parsing text. It started with the
 * commercial refusals; B3.0.1 adds the account / ownership / subscription-rule
 * reasons (a reason is a fixed code and never carries private data).
 */
export type CommercialReasonCode =
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'CLIENT_CAPACITY_REACHED'
  | 'CAPACITY_REQUEST_PENDING'
  | 'SUBSCRIPTION_REQUEST_PENDING'
  | 'CAPACITY_PACKAGE_UNAVAILABLE'
  | 'REQUEST_ALREADY_RESOLVED'
  // B3.0.1
  | 'ACCOUNT_NOT_ACTIVE' // B3-S04: a non-active account may read but not write messages
  | 'CONVERSATION_CLOSED' // B3-S14: the message belongs to (or was composed in) another coach's conversation
  | 'NO_ACTIVE_COACH' // B3-S14: a client with no coach has no conversation to write to
  | 'RELATIONSHIP_ENDED' // B3-S05: a former coach may not change the relationship
  | 'SUBSCRIPTION_CHANGED' // concurrent subscription change (compare-and-set lost)
  | 'RENEWAL_REQUIRED'
  | 'FREEZE_NOT_ALLOWED'
  | 'FREEZE_INVALID_WINDOW'
  | 'FREEZE_OUT_OF_TERM'
  | 'NOT_FROZEN'
  // B3.4 compatibility gate
  | 'CHECKIN_STALE' // the check-in is a previous coach's request left open — nobody's to answer now
  | 'CHECKIN_AMBIGUOUS' // a submission by week alone (an older app) while the week has two open requests
  // B3.9 (B3-S09 / audit)
  | 'CHECKIN_NOT_SUBMITTED' // a check-in is reviewed only once the client answered it
  | 'CHECKIN_ANSWERED' // an answered check-in is kept (it holds the client's answers) — only an open request is withdrawn
  | 'ASSESSMENT_NOT_SUBMITTED' // an assessment is reviewed only once the client submitted it
  // B3.5
  | 'TARGETS_CONFLICT' // a daily target changed since the editor read it (per-field compare-and-set)
  // B3.8
  | 'UNSUPPORTED_CURRENCY' // EGP-only: an explicit non-EGP amount is refused, never relabelled
  | 'APP_UPDATE_REQUIRED' // a pre-B3.8 app sent `setTerm` / `setPrice`, whose meaning is now explicit (Fix C)
  | 'TERM_EXISTS' // `newTerm` on a client who already has a term — renew or correct it instead
  | 'NO_TERM' // `renew` / `correct` with no term to renew or correct
  | 'RENEWAL_STARTS_AFTER_TERM' // a running term is renewed from its end, never from another day
  | 'RENEWAL_DURING_FREEZE' // a running term with an unfinished pause is renewed after the pause
  | 'PAYMENT_EXCEEDS_BALANCE' // a payment larger than what is still owed on its term
  | 'PAYMENT_ALREADY_REVERSED' // a payment can be reversed / corrected once
  | 'PAYMENT_NOT_FOUND'
  | 'TERM_NOT_FOUND' // the payment's term is not one of this relationship's terms
  // B3.8 security (B36-R4 / B39A-S01)
  | 'RATE_LIMITED' // too many requests in the current window — `data.retryAfter` says how many seconds to wait
  | 'DESTINATION_CAPACITY_REACHED' // a transfer's RECEIVING coach has no free client place (B3.9)
  | 'DESTINATION_NOT_ACCEPTING'; // a transfer's receiving coach has no active Forma plan (B3.9)

export class CommercialReason extends Error {
  readonly reason: CommercialReasonCode | string;
  /** Seconds the caller should wait before retrying (`RATE_LIMITED`); surfaced as `error.data.retryAfter`. */
  readonly retryAfter?: number;
  constructor(reason: CommercialReasonCode | string, opts: { retryAfter?: number } = {}) {
    super(reason);
    this.name = 'CommercialReason';
    this.reason = reason;
    if (opts.retryAfter != null) this.retryAfter = opts.retryAfter;
  }
}
