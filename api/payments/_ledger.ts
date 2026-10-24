import type { CoachClientDoc, SubscriptionDoc, SubscriptionPeriodDoc } from '../coach-clients/_types.js';
import type { ClientPaymentDoc } from './_types.js';

/**
 * B3.8 — the payment ledger's arithmetic, pure (no database), shared by the service's checks and
 * pinned by tests. Money is integers of piastres throughout. KEEP IN STEP with
 * `src/lib/payments.ts` (parity test `src/lib/paymentsParity.test.ts`).
 */

/** A package price (major-unit EGP, at most two decimals) in piastres. */
export function toMinor(price: number | undefined | null): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price * 100);
}

export interface TermRef {
  termId: string;
  priceMinor: number;
  startAt: number;
  endAt: number;
  current: boolean;
}

/**
 * The economic terms a payment can point at: the relationship's current term, its renewed terms
 * and those of earlier stints with the same coach — every one that has an id (terms written
 * before B3.8 get theirs on their first change).
 */
export function termsOfRelationship(rel: Pick<CoachClientDoc, 'subscription' | 'subscriptionHistory' | 'previousStints'>): TermRef[] {
  const out: TermRef[] = [];
  const add = (t: SubscriptionDoc | SubscriptionPeriodDoc | undefined, current: boolean) => {
    if (!t || !t.termId || t.status === 'pending') return;
    out.push({ termId: t.termId, priceMinor: toMinor(t.price), startAt: t.startAt, endAt: t.endAt, current });
  };
  add(rel.subscription, true);
  for (const h of rel.subscriptionHistory ?? []) add(h, false);
  for (const s of rel.previousStints ?? []) {
    add(s.subscription, false);
    for (const h of s.subscriptionHistory ?? []) add(h, false);
  }
  return out;
}

/** A payment that counts: a payment (not a reversal record) that was not reversed. */
export const isLivePayment = (p: Pick<ClientPaymentDoc, 'kind' | 'reversedById'>) => p.kind === 'payment' && !p.reversedById;

/** Piastres paid against each term (live payments only). */
export function paidByTerm(payments: Pick<ClientPaymentDoc, 'kind' | 'reversedById' | 'termId' | 'amountMinor'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) {
    if (!isLivePayment(p) || !p.termId) continue;
    out.set(p.termId, (out.get(p.termId) ?? 0) + p.amountMinor);
  }
  return out;
}

/**
 * What is still owed on a term, and any credit. Never negative: a term whose price was later
 * corrected below what was already paid shows `overpaid`, with nothing outstanding.
 */
export function balanceOf(priceMinor: number, paidMinor: number): { outstandingMinor: number; overpaidMinor: number } {
  return { outstandingMinor: Math.max(0, priceMinor - paidMinor), overpaidMinor: Math.max(0, paidMinor - priceMinor) };
}
