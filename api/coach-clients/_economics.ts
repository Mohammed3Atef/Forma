import type { CoachClientDoc, PreviousStintDoc, SubscriptionEventDoc, SubscriptionSnapshot } from './_types.js';

/**
 * B3.8 final (owner, B38F-R2, 2026-10-22): a coach's client-package economics — price, currency,
 * package name, billing cycle and the coach's own note on a term, in every version of it — are the
 * coach's business and private to that coach (and to the client, who pays them). Any other reader
 * of a relationship (an admin through `users.read`) gets the coaching facts only: status, dates,
 * length, freezes, the term's id. Forma's own billing (coach plans, requests, add-ons) is separate.
 */
type Economic = 'price' | 'currency' | 'planName' | 'billingCycle' | 'note';

function strip<T extends object>(o: T): T {
  const { price: _p, currency: _c, planName: _n, billingCycle: _b, note: _note, ...rest } = o as T & Partial<Record<Economic, unknown>>;
  return rest as T;
}

const snapshot = (s: SubscriptionSnapshot | null): SubscriptionSnapshot | null => (s ? strip(s) : s);
const event = (e: SubscriptionEventDoc): SubscriptionEventDoc => ({ ...e, before: snapshot(e.before), after: snapshot(e.after)! });

/** One term without its economics (any term shape: relationship, history, or an admin read model). */
export function subscriptionWithoutEconomics<T extends object>(sub: T | undefined): T | undefined {
  return sub ? strip(sub) : sub;
}

function stint(s: PreviousStintDoc): PreviousStintDoc {
  return {
    ...s,
    ...(s.subscription ? { subscription: strip(s.subscription) } : {}),
    ...(s.subscriptionHistory ? { subscriptionHistory: s.subscriptionHistory.map(strip) } : {}),
    ...(s.subscriptionEvents ? { subscriptionEvents: s.subscriptionEvents.map(event) } : {}),
  };
}

/** A relationship as a reader who is neither its coach nor its client may see it. */
export function withoutPackageEconomics(rel: CoachClientDoc): CoachClientDoc {
  return {
    ...rel,
    ...(rel.subscription ? { subscription: strip(rel.subscription) } : {}),
    ...(rel.subscriptionHistory ? { subscriptionHistory: rel.subscriptionHistory.map(strip) } : {}),
    ...(rel.subscriptionEvents ? { subscriptionEvents: rel.subscriptionEvents.map(event) } : {}),
    ...(rel.previousStints ? { previousStints: rel.previousStints.map(stint) } : {}),
  };
}

/** Whether `userId` may see the economics of `rel`: its own coach, or its client. */
export const seesPackageEconomics = (rel: Pick<CoachClientDoc, 'coachId' | 'clientId'>, userId: string) => rel.coachId === userId || rel.clientId === userId;
