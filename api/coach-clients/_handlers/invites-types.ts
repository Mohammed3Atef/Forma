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
  /**
   * B4.1 — what happened to the invite email, as far as Forma knows: `sent` (the provider accepted
   * it), `not-sent` (nothing went out — email disabled, no trusted origin, provider error, or the
   * inbox protection ceiling), `unconfirmed` (no answer in time — it may still arrive). Absent: no
   * email address on the invite.
   */
  emailStatus?: 'sent' | 'not-sent' | 'unconfirmed';
  /** Why it was not sent (server-side only — never returned: it could hint at other coaches' invites). */
  emailIssue?: 'disabled' | 'no-trusted-origin' | 'provider-error' | 'timeout' | 'delivery-limit';
  emailAttemptAt?: number;
  emailAttempts?: number;
  claimedByUid?: string | null;
  createdAt: number;
  claimedAt?: number | null;
  expiresAt?: number | null;
}
