import type { ClientPayment, CoachClientRelationship, Subscription, SubscriptionPeriod } from '../types';

/**
 * B3.8 (owner decision 1) — the manual payment ledger's arithmetic on the device, the same rules
 * as `api/payments/_ledger.ts` (parity test `paymentsParity.test.ts`). Integers of piastres only.
 *
 *  - A payment counts unless it was reversed; a reversed payment is void in every total and month.
 *  - Outstanding on a term = its price − what was paid on it, never below zero; the excess (a price
 *    corrected below what was already paid) is a credit (`overpaidMinor`).
 */

/** A package price (major-unit EGP, at most two decimals) in piastres. */
export function toMinor(price: number | undefined | null): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return 0;
  return Math.round(price * 100);
}

/** Pounds typed by a person ("1,250.5") in piastres; null when not a valid amount with ≤ 2 decimals. */
export function parseEgpToMinor(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const minor = Math.round(value * 100);
  return Math.abs(minor - value * 100) < 1e-6 ? minor : null;
}

export const isLivePayment = (p: Pick<ClientPayment, 'kind' | 'reversedById'>) => p.kind === 'payment' && !p.reversedById;

export function paidByTerm(payments: Pick<ClientPayment, 'kind' | 'reversedById' | 'termId' | 'amountMinor'>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) {
    if (!isLivePayment(p) || !p.termId) continue;
    out.set(p.termId, (out.get(p.termId) ?? 0) + p.amountMinor);
  }
  return out;
}

export function balanceOf(priceMinor: number, paidMinor: number): { outstandingMinor: number; overpaidMinor: number } {
  return { outstandingMinor: Math.max(0, priceMinor - paidMinor), overpaidMinor: Math.max(0, paidMinor - priceMinor) };
}

export interface PayableTerm {
  termId: string;
  priceMinor: number;
  term: Subscription | SubscriptionPeriod;
  current: boolean;
}

/** The terms of a relationship a payment can point at (newest first): those with an id. */
export function payableTerms(rel: Pick<CoachClientRelationship, 'subscription' | 'subscriptionHistory' | 'previousStints'>): PayableTerm[] {
  const out: PayableTerm[] = [];
  const add = (t: Subscription | SubscriptionPeriod | undefined, current: boolean) => {
    if (!t || !t.termId || t.status === 'pending') return;
    out.push({ termId: t.termId, priceMinor: toMinor(t.price), term: t, current });
  };
  add(rel.subscription, true);
  for (const h of [...(rel.subscriptionHistory ?? [])].reverse()) add(h, false);
  for (const s of [...(rel.previousStints ?? [])].reverse()) {
    add(s.subscription, false);
    for (const h of [...(s.subscriptionHistory ?? [])].reverse()) add(h, false);
  }
  return out;
}
