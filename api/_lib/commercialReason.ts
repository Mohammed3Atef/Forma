/**
 * Stable, machine-readable reason for a commercial refusal, carried as the
 * `cause` of a TRPCError and surfaced to clients as `error.data.reason` by the
 * tRPC error formatter (api/_trpc/trpc.ts). Lets the UI distinguish
 * SUBSCRIPTION_EXPIRED from CLIENT_CAPACITY_REACHED etc. without parsing text.
 */
export type CommercialReasonCode =
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'CLIENT_CAPACITY_REACHED'
  | 'CAPACITY_REQUEST_PENDING'
  | 'SUBSCRIPTION_REQUEST_PENDING'
  | 'CAPACITY_PACKAGE_UNAVAILABLE'
  | 'REQUEST_ALREADY_RESOLVED';

export class CommercialReason extends Error {
  readonly reason: CommercialReasonCode | string;
  constructor(reason: CommercialReasonCode | string) {
    super(reason);
    this.name = 'CommercialReason';
    this.reason = reason;
  }
}
