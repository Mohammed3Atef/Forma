import type { BillingCycle, SubscriptionStatus } from '../_types.js';

/**
 * Local (Mongo-era) mirror of `SignupInvite` from `src/types/index.ts`.
 * `_id` == the invite code (matches the Firestore `signupInvites/{code}`
 * doc-id convention — the code is the capability).
 */
export type SignupInviteStatus = 'pending' | 'claimed' | 'revoked';

export interface SignupInviteDoc {
  _id: string; // == code
  coachId: string;
  /** Coach display name, denormalised so the pre-auth claim screen needs no `users` read. */
  coachName?: string;
  email?: string;
  displayName?: string;
  phone?: string;
  // Client subscription the coach chose on this invite; applied on claim so no
  // invited client is ever assigned without a subscription state. Defaults to trial.
  subStatus?: SubscriptionStatus;
  subPlanName?: string;
  subPrice?: number;
  subCurrency?: string;
  subBillingCycle?: BillingCycle;
  subMonths?: number;
  subDays?: number;
  subTrialDays?: number;
  /** B3.8: the coach device's IANA zone at invite time — the claimed term's days are meant in it. */
  subZone?: string;
  status: SignupInviteStatus;
  claimedByUid?: string | null;
  createdAt: number;
  claimedAt?: number | null;
  expiresAt?: number | null;
}
