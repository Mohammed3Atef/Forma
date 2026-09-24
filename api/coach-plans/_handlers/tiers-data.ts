import type { Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';

/**
 * Backend-local mirror of `src/types/index.ts`'s `CoachPlanTierConfig` +
 * `src/services/platform/coachPlanTiersApi.ts`'s Firestore logic, ported to a
 * top-level Mongo collection `coachPlanTiers` (`_id` = the tier key, was the
 * Firestore doc id). Admin-editable pricing/limit config for Layer-A coach
 * plans (the coach's own subscription to Forma) — no payment gateway, this is
 * tracking only.
 */

/** Bilingual text — mirrors `src/types/index.ts`'s `LocalizedText`. Both required: the frontend always fills `ar` from `en` at save time if left blank, so a tier is never partially untranslated. Covers both `ar` and `ar-eg` (Egyptian visitors see the same Arabic text) — resolved client-side via `useLocalized()`. */
export interface LocalizedText {
  en: string;
  ar: string;
}

/** Same idea as `LocalizedText` but for an ordered list (e.g. plan feature bullets). */
export interface LocalizedTextList {
  en: string[];
  ar: string[];
}

export interface CoachPlanTierConfigDoc {
  _id: string; // tier key ('trial' | custom, e.g. 'pro')
  label?: string;
  maxClients: number;
  priceMonthly: number;
  currency?: string;
  order?: number;
  active?: boolean;
  archived?: boolean;
  builtIn?: boolean;
  // ---- Marketing / signup (additive — operational fields above unchanged) --
  /** Shows on the public Marketing pricing section. */
  publicVisible?: boolean;
  /** Selectable at coach signup. */
  signupEnabled?: boolean;
  /** At most one tier may have this true — validated on save. */
  highlighted?: boolean;
  /**
   * Exactly one active/non-archived/signupEnabled tier must have this true —
   * validated atomically on every `coachPlanTiers.save` — and that tier must
   * have `requiresPaymentConfirmation: false`. This is the tier a new coach
   * signup falls back to when no/an invalid/a disabled plan was requested.
   * Never inferred from price/key — always this explicit flag.
   */
  isDefaultSignupPlan?: boolean;
  /** Never hardcoded/single-language — every admin-entered marketing field supports English + Arabic; ar-eg visitors see the Arabic text. */
  marketingTitle?: LocalizedText;
  marketingDescription?: LocalizedText;
  marketingFeatures?: LocalizedTextList;
  /** false = activates immediately on signup (the Trial tier); true = creates an awaiting CoachPlanRequest instead, never activated until Super Admin confirms payment. */
  requiresPaymentConfirmation?: boolean;
  /** Meaningful on the tier where `isDefaultSignupPlan` is true. */
  trialDurationDays?: number;
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

export const SEED_ORDER: Record<string, number> = { trial: 0 };

/**
 * `trial` is the ONLY code-seeded/built-in tier — every paid tier (e.g.
 * "Pro") is created entirely from the dashboard (`AdminPlans.tsx`), never
 * hardcoded here. `trial.maxClients` (10) mirrors `TRIAL_MAX_CLIENTS` in
 * `../coach-plans/_data.ts` — keep the two in sync by hand, same discipline
 * as firestore.rules vs. the frontend constants today.
 */
export const COACH_PLAN_TIERS: Record<string, { maxClients: number; priceMonthly: number }> = {
  trial: { maxClients: 2, priceMonthly: 0 },
};

/** Marketing/signup seed defaults for the one built-in tier — admin-editable afterwards via `coachPlanTiers.save`. */
const SEED_MARKETING: Record<string, Partial<CoachPlanTierConfigDoc>> = {
  trial: {
    label: 'Trial',
    publicVisible: true,
    signupEnabled: true,
    isDefaultSignupPlan: true,
    requiresPaymentConfirmation: false,
    trialDurationDays: 15,
    marketingTitle: { en: 'Trial', ar: 'تجربة' },
    marketingDescription: { en: 'Everything you need to try Forma with real clients.', ar: 'كل ما تحتاجه لتجربة Forma مع عملاء حقيقيين.' },
    // Empty — the Trial gets exactly the shared Core features below and
    // nothing extra; a tier's own `marketingFeatures` is reserved for what
    // that specific tier adds ON TOP of Core (see `getCoreFeatures`).
    marketingFeatures: { en: [], ar: [] },
  },
};

/**
 * Shared "Core features" — shown on EVERY plan card (Trial and every paid
 * tier alike), edited ONCE from the dashboard rather than re-typed per tier.
 * A tier's own `marketingFeatures` is reserved for what that tier adds ON TOP
 * of this list (e.g. analytics/reports for a paid tier) — never duplicated
 * here. Stored as a tiny singleton doc in its own collection so it's not
 * mixed into `coachPlanTiers` (which is keyed per tier).
 */
export interface PlatformPricingSettingsDoc {
  _id: 'pricing';
  coreFeatures: LocalizedTextList;
  updatedAt: number;
}

const DEFAULT_CORE_FEATURES: LocalizedTextList = {
  en: [
    'Workout & nutrition plan builder',
    'Reusable workout & nutrition templates',
    'Client invites & management',
    'Client messaging',
    'Check-ins & progress tracking',
    'Assessments & coach notes',
  ],
  ar: [
    'إنشاء خطط تمارين وتغذية',
    'قوالب تمارين وتغذية قابلة لإعادة الاستخدام',
    'دعوة العملاء وإدارتهم',
    'مراسلة العملاء',
    'متابعات دورية وتتبع التقدم',
    'التقييمات وملاحظات المدرب',
  ],
};

export async function platformSettingsCol(): Promise<Collection<PlatformPricingSettingsDoc>> {
  return (await getDb()).collection<PlatformPricingSettingsDoc>('platformSettings');
}

/** Falls back to `DEFAULT_CORE_FEATURES` until a super-admin edits/saves the list at least once. */
export async function getCoreFeatures(): Promise<LocalizedTextList> {
  const col = await platformSettingsCol();
  const doc = await col.findOne({ _id: 'pricing' });
  return doc?.coreFeatures ?? DEFAULT_CORE_FEATURES;
}

export async function saveCoreFeatures(features: LocalizedTextList): Promise<LocalizedTextList> {
  const col = await platformSettingsCol();
  await col.updateOne({ _id: 'pricing' }, { $set: { coreFeatures: features, updatedAt: Date.now() } }, { upsert: true });
  return features;
}

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
    ...SEED_MARKETING[key],
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

/**
 * Atomic invariant check run on every `coachPlanTiers.save` — takes the FULL
 * resulting tier list (the proposed doc already merged in by the caller) and
 * validates: exactly one active/non-archived/signupEnabled tier has
 * `isDefaultSignupPlan: true` (and it must have `requiresPaymentConfirmation:
 * false` — a paid tier can never be the safe fallback), and at most one
 * active/non-archived tier has `highlighted: true`. Returns an error message
 * or null if valid — never throws itself, so callers can shape the tRPC error.
 */
export function validateTierInvariants(allTiers: CoachPlanTierConfigDoc[]): string | null {
  const eligible = allTiers.filter((t) => t.active !== false && !t.archived);
  const defaults = eligible.filter((t) => t.isDefaultSignupPlan && t.signupEnabled);
  if (defaults.length === 0) return 'Exactly one active, signup-enabled tier must be the default signup plan.';
  if (defaults.length > 1) return `Only one tier may be the default signup plan — found ${defaults.length}: ${defaults.map((t) => t._id).join(', ')}.`;
  if (defaults[0].requiresPaymentConfirmation) return 'The default signup plan must not require payment confirmation.';
  const highlighted = eligible.filter((t) => t.highlighted);
  if (highlighted.length > 1) return `Only one tier may be highlighted — found ${highlighted.length}: ${highlighted.map((t) => t._id).join(', ')}.`;
  return null;
}

/** Safe subset for the public (signed-out) Marketing/signup surface — never admin notes/audit/internal fields. Marketing text stays localized (en required, ar optional) — the frontend resolves it against the current locale, same fallback chain as the rest of the app's i18n. */
export interface PublicPlanTier {
  key: string;
  marketingTitle: LocalizedText;
  marketingDescription: LocalizedText;
  marketingFeatures: LocalizedTextList;
  priceMonthly: number;
  currency: string;
  maxClients: number;
  highlighted: boolean;
  signupEnabled: boolean;
  isDefaultSignupPlan: boolean;
  trialDurationDays: number | null;
  requiresPaymentConfirmation: boolean;
  order: number;
}

export function toPublicPlanTier(t: CoachPlanTierConfigDoc): PublicPlanTier {
  return {
    key: t._id,
    marketingTitle: t.marketingTitle ?? { en: t.label || t._id, ar: t.label || t._id },
    marketingDescription: t.marketingDescription ?? { en: '', ar: '' },
    marketingFeatures: t.marketingFeatures ?? { en: [], ar: [] },
    priceMonthly: t.priceMonthly,
    currency: t.currency ?? 'EGP',
    maxClients: t.maxClients,
    highlighted: !!t.highlighted,
    signupEnabled: !!t.signupEnabled,
    isDefaultSignupPlan: !!t.isDefaultSignupPlan,
    trialDurationDays: t.trialDurationDays ?? null,
    requiresPaymentConfirmation: !!t.requiresPaymentConfirmation,
    order: t.order ?? 99,
  };
}
