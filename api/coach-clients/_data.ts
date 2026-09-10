import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb';
import type { ClientSubscriptionInput, CoachClientDoc, CoachPlanDoc, SubscriptionDoc } from './_types';

const SUB_DAY = 86_400_000;

export async function coachClientsCol(): Promise<Collection<CoachClientDoc>> {
  return (await getDb()).collection<CoachClientDoc>('coachClients');
}

/** Read-only accessor onto the parallel `coachPlans` module's collection. */
export async function coachPlansCol(): Promise<Collection<CoachPlanDoc>> {
  return (await getDb()).collection<CoachPlanDoc>('coachPlans');
}

/** Deterministic relationship id — mirrors the Firestore doc-id convention. */
export function relId(coachId: string, clientId: string): string {
  return `${coachId}__${clientId}`;
}

/** Calendar-accurate `startAt + months` → end timestamp (same as `src/lib/subscription.ts`). */
export function addMonths(startAt: number, months: number): number {
  const d = new Date(startAt);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/**
 * Build a concrete `Subscription` from a coach's chosen term (no undefined
 * fields written to Mongo) — exact port of `buildSubscription()` in
 * `src/services/platform/coachClientsApi.ts`.
 */
export function buildSubscription(input: ClientSubscriptionInput, now: number): SubscriptionDoc {
  const start = input.startAt ?? now;
  const base: SubscriptionDoc = {
    startAt: start,
    endAt: start,
    status: input.status,
    frozenFrom: null,
    frozenUntil: null,
    updatedAt: now,
    ...(typeof input.price === 'number' ? { price: input.price } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.planName ? { planName: input.planName } : {}),
    ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
  };
  if (input.status === 'trial') return { ...base, endAt: start + (input.trialDays ?? 14) * SUB_DAY };
  if (input.status === 'active') {
    // Days-based term (coach plan with unit='days') takes priority; else months.
    if (typeof input.days === 'number' && input.days > 0) return { ...base, endAt: start + input.days * SUB_DAY };
    const months = input.months ?? 1;
    return { ...base, months, endAt: addMonths(start, months) };
  }
  return base; // pending / expired / cancelled / frozen / ended: no term math
}

/**
 * True when the coach is at/over their client cap, per `coachPlans`.
 *
 * NOTE — this is intentionally STRICTER than `firestore.rules`' `coachAtClientCap()`,
 * which treats a missing/legacy plan doc as "not blocked" (best-effort). Per this
 * migration's explicit product decision, a missing or malformed `coachPlans` doc is
 * treated as "at cap" here — the safer failure mode is refusing a new client link,
 * never silently allowing unlimited clients.
 */
export async function coachAtClientCap(coachId: string): Promise<boolean> {
  const col = await coachPlansCol();
  const plan = await col.findOne({ _id: coachId });
  if (!plan) return true;
  const max = plan.maxClients;
  const count = plan.activeClientCount;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return true;
  if (typeof count !== 'number' || !Number.isFinite(count)) return true;
  return count >= max;
}

/** Best-effort maintained counter — never fails the caller's request. */
export async function bumpActiveClientCount(coachId: string, delta: number): Promise<void> {
  try {
    const col = await coachPlansCol();
    await col.updateOne({ _id: coachId }, { $inc: { activeClientCount: delta }, $set: { updatedAt: Date.now() } });
  } catch (e) {
    console.warn('[coach-clients] bumpActiveClientCount failed (non-fatal):', e);
  }
}
