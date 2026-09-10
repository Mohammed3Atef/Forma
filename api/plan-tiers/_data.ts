import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb';

/**
 * Backend-local mirror of `src/types/index.ts`'s `CoachPlanTierConfig` +
 * `src/services/platform/coachPlanTiersApi.ts`'s Firestore logic, ported to a
 * top-level Mongo collection `coachPlanTiers` (`_id` = the tier key, was the
 * Firestore doc id). Admin-editable pricing/limit config for Layer-A coach
 * plans (the coach's own subscription to Forma) — no payment gateway, this is
 * tracking only.
 */

export interface CoachPlanTierConfigDoc {
  _id: string; // tier key ('trial' | 'starter' | 'pro' | 'enterprise' | custom)
  label?: string;
  maxClients: number;
  priceMonthly: number;
  currency?: string;
  order?: number;
  active?: boolean;
  archived?: boolean;
  builtIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The exact shape returned to the frontend — matches `CoachPlanTierConfig` field-for-field. */
export type PublicCoachPlanTier = Omit<CoachPlanTierConfigDoc, '_id'> & { key: string };

export function toPublicTier(doc: CoachPlanTierConfigDoc): PublicCoachPlanTier {
  const { _id, ...rest } = doc;
  return { key: _id, ...rest };
}

export async function coachPlanTiersCol(): Promise<Collection<CoachPlanTierConfigDoc>> {
  return (await getDb()).collection<CoachPlanTierConfigDoc>('coachPlanTiers');
}

const SEED_ORDER: Record<string, number> = { trial: 0, starter: 1, pro: 2, enterprise: 3 };

/**
 * Built-in tiers as always-present seed/fallback (mirrors COACH_PLAN_TIERS in
 * `src/services/platform/coachPlanApi.ts`). `trial.maxClients` (10) mirrors
 * `TRIAL_MAX_CLIENTS` in `../coach-plans/_data.ts` — keep the two in sync by
 * hand, same discipline as firestore.rules vs. the frontend constants today.
 */
export const COACH_PLAN_TIERS: Record<string, { maxClients: number; priceMonthly: number }> = {
  trial: { maxClients: 10, priceMonthly: 0 },
  starter: { maxClients: 25, priceMonthly: 0 },
  pro: { maxClients: 100, priceMonthly: 0 },
  enterprise: { maxClients: 1000, priceMonthly: 0 },
};

function seedTiers(): CoachPlanTierConfigDoc[] {
  return Object.keys(COACH_PLAN_TIERS).map((key) => ({
    _id: key,
    label: '',
    maxClients: COACH_PLAN_TIERS[key]?.maxClients ?? 0,
    priceMonthly: COACH_PLAN_TIERS[key]?.priceMonthly ?? 0,
    currency: 'EGP',
    order: SEED_ORDER[key] ?? 99,
    active: true,
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  }));
}

/** Built-in seed + Mongo overrides/customs (Mongo wins per key). Sorted by order. */
export async function listTiers(includeArchived = false): Promise<CoachPlanTierConfigDoc[]> {
  const col = await coachPlanTiersCol();
  const docs = await col.find({}).toArray();
  const map = new Map<string, CoachPlanTierConfigDoc>();
  for (const t of seedTiers()) map.set(t._id, t);
  for (const d of docs) map.set(d._id, d);
  let list = [...map.values()];
  if (!includeArchived) list = list.filter((t) => !t.archived);
  return list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a._id.localeCompare(b._id));
}

/** Single tier lookup: Mongo override if present, else the built-in seed. */
export async function getTier(key: string): Promise<CoachPlanTierConfigDoc | null> {
  const col = await coachPlanTiersCol();
  const doc = await col.findOne({ _id: key });
  if (doc) return doc;
  return seedTiers().find((t) => t._id === key) ?? null;
}

export function normalizeTierKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
