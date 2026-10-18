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
  | 'CHECKIN_AMBIGUOUS'; // a submission by week alone (an older app) while the week has two open requests

export class CommercialReason extends Error {
  readonly reason: CommercialReasonCode | string;
  constructor(reason: CommercialReasonCode | string) {
    super(reason);
    this.name = 'CommercialReason';
    this.reason = reason;
  }
}
