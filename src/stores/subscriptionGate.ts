/**
 * Synchronous mirror of the client's subscription read-only state so the
 * (framework-agnostic) data stores can block coach-plan logging while a
 * subscription is frozen or ended. Kept in sync by `useSubscription()`.
 */
let readOnly = false;

export function setSubscriptionReadOnly(value: boolean): void {
  readOnly = value;
}

/** True when the client's subscription is frozen/ended → coach plans are view-only. */
export function isSubscriptionReadOnly(): boolean {
  return readOnly;
}
