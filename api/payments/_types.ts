/**
 * B3.8 (owner decision 1, 2026-10-21) — payments a coach RECORDS by hand: money the coach says a
 * client paid them in cash, by mobile wallet or by InstaPay. Forma is not a payment gateway and
 * verifies nothing; a record is the coach's own statement, kept as an audit trail.
 *
 * Rules:
 *  - Amounts are whole piastres (EGP minor units, integers) — never floating-point pounds.
 *  - A recorded payment is never edited or deleted. A mistake is REVERSED (a `reversal` record
 *    pointing at it, the original marked `reversedById`) — at most once (unique index) — and a
 *    correction is a reversal plus a new payment (`correctsId`), in one transaction.
 *  - A reversed payment is void: it counts in no total, in any month. Reversals are reported on
 *    their own.
 *  - A payment may point at one of the relationship's economic terms (`termId`); it can never
 *    take a term past its price (no overpayment at entry). A price corrected downwards later can
 *    leave a term overpaid — shown as a credit, never as a negative balance.
 *  - `requestId` (unique per coach) makes a retried or double-clicked save record once.
 */

/** How the coach says the money reached them. Extensible later (e.g. a wallet provider) without inventing one now. */
export type PaymentMethod = 'cash' | 'mobile_wallet' | 'instapay';
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'mobile_wallet', 'instapay'];

export interface ClientPaymentDoc {
  _id: string;
  kind: 'payment' | 'reversal';
  coachId: string;
  clientId: string;
  /** `${coachId}__${clientId}` — the relationship document the payment belongs to. */
  relationshipId: string;
  /** The economic term it pays for (`subscription.termId`), or null when not tied to one. */
  termId: string | null;
  /** Positive integer, piastres. A reversal carries the amount it voids. */
  amountMinor: number;
  currency: 'EGP';
  method: PaymentMethod;
  /** When the coach says the money was received (a reversal: when it was reversed). */
  paidAt: number;
  reference?: string;
  note?: string;
  /** A reversal: the payment it voids. Unique — a payment is reversed at most once. */
  reversesId?: string;
  /** A payment that was reversed: the reversal's id and time. */
  reversedById?: string;
  reversedAt?: number;
  /** Why it was reversed (the reversal record). */
  reason?: string;
  /** A payment entered to correct another (that one is reversed in the same transaction). */
  correctsId?: string;
  requestId: string;
  createdBy: string;
  createdByRole: 'coach' | 'admin';
  createdAt: number;
}

/** Serialises payments on one term (write-conflict lock inside the payment transaction). */
export interface PaymentTermLockDoc {
  _id: string; // `${relationshipId}:${termId}`
  seq: number;
  updatedAt: number;
}
