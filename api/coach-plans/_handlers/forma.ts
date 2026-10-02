import type { ClientSession, Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';

/**
 * FORMA — the ONE public subscription product.
 *
 * There are no competing tiers. Every coach is on Forma: first the Free Trial
 * (`CoachPlanDoc.plan === 'trial'`), then the monthly subscription
 * (`plan === 'forma'`). Both phases carry the SAME features; they differ only
 * in entitlement duration / payment state. Extra client capacity is sold
 * separately as capacity add-ons (`../_capacity.ts`), never as another plan.
 *
 * Stored as a single doc `coachPlanTiers/forma` (the collection the old tier
 * model used, so existing indexes/backups need no change). Every value here
 * is Super-Admin-editable — the constants below are only the seed used until
 * the first save, never read by frontend logic.
 */

export const FORMA_ID = 'forma';
const DAY_MS = 86_400_000;

/** Bilingual text — every admin-entered marketing field supports English + Arabic. */
export interface LocalizedText {
  en: string;
  ar: string;
}
export interface LocalizedTextList {
  en: string[];
  ar: string[];
}

export interface FormaConfigDoc {
  _id: typeof FORMA_ID;
  /** Internal display name (admin/coach UI). Public copy uses `marketingTitle`. */
  label: string;
  trialEnabled: boolean;
  trialDurationDays: number;
  /** Client limit during the Trial. `null` = same as `maxClients`. */
  trialClientLimit: number | null;
  /** Base active-client limit included in Forma (before capacity add-ons). */
  maxClients: number;
  /** Price per billing interval. */
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  /** Length of one paid term in days (monthly = 30). */
  termDays: number;
  publicVisible: boolean;
  signupEnabled: boolean;
  marketingTitle: LocalizedText;
  marketingDescription: LocalizedText;
  marketingFeatures: LocalizedTextList;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_FEATURES: LocalizedTextList = {
  en: [
    'Complete client tracking',
    'Workout & nutrition programming',
    'Progress photos & measurements',
    'Check-ins & assessments',
    'Direct client messaging',
    'Client adherence & progress analytics',
    'Exercise, food & supplement libraries',
    'Reusable templates',
    'Revenue & subscription tracking',
    'Full coach-controlled workflow',
    '100% Coach-Led — No AI replacing you',
  ],
  ar: [
    'متابعة كاملة للعملاء',
    'برمجة التمارين والتغذية',
    'صور التقدّم والقياسات',
    'المتابعات الدورية والتقييمات',
    'مراسلة مباشرة مع العملاء',
    'تحليلات الالتزام والتقدّم',
    'مكتبات التمارين والأطعمة والمكمّلات',
    'قوالب قابلة لإعادة الاستخدام',
    'متابعة الإيرادات والاشتراكات',
    'سير عمل يتحكم فيه المدرب بالكامل',
    'بقيادة المدرب 100% — بدون ذكاء اصطناعي يحل محلك',
  ],
};

/** Seed used until a Super Admin saves the Forma configuration for the first time. */
export function defaultFormaConfig(now = 0): FormaConfigDoc {
  return {
    _id: FORMA_ID,
    label: 'Forma',
    trialEnabled: true,
    trialDurationDays: 15,
    trialClientLimit: null,
    maxClients: 25,
    priceMonthly: 499,
    currency: 'EGP',
    billingInterval: 'month',
    termDays: 30,
    publicVisible: true,
    signupEnabled: true,
    marketingTitle: { en: 'Forma', ar: 'فورما' },
    marketingDescription: { en: 'One plan. Everything included.', ar: 'خطة واحدة. كل شيء مشمول.' },
    marketingFeatures: DEFAULT_FEATURES,
    createdAt: now,
    updatedAt: now,
  };
}

export async function formaConfigCol(): Promise<Collection<FormaConfigDoc>> {
  return (await getDb()).collection<FormaConfigDoc>('coachPlanTiers');
}

/** The current Forma configuration (stored doc merged over the seed, so a partially-written legacy doc never yields undefined fields). */
export async function getFormaConfig(session?: ClientSession): Promise<FormaConfigDoc> {
  const col = await formaConfigCol();
  const doc = await col.findOne({ _id: FORMA_ID }, { session });
  const base = defaultFormaConfig();
  return doc ? { ...base, ...stripUndefined(doc) } : base;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Client limit a NEW trial starts with. */
export function trialLimitOf(cfg: Pick<FormaConfigDoc, 'trialClientLimit' | 'maxClients'>): number {
  return cfg.trialClientLimit ?? cfg.maxClients;
}

export function trialEndsAt(cfg: Pick<FormaConfigDoc, 'trialDurationDays'>, from: number): number {
  return from + cfg.trialDurationDays * DAY_MS;
}

/** Field-level validation for a save; returns an error message or null. */
export function validateFormaConfig(c: FormaConfigDoc): string | null {
  if (!Number.isInteger(c.maxClients) || c.maxClients < 1) return 'The base client limit must be at least 1.';
  if (c.trialClientLimit != null && (!Number.isInteger(c.trialClientLimit) || c.trialClientLimit < 1)) return 'The trial client limit must be at least 1.';
  if (!Number.isInteger(c.trialDurationDays) || c.trialDurationDays < 1 || c.trialDurationDays > 365) return 'Trial duration must be 1–365 days.';
  if (!Number.isInteger(c.termDays) || c.termDays < 1 || c.termDays > 366) return 'Subscription term must be 1–366 days.';
  if (!(c.priceMonthly >= 0)) return 'Price cannot be negative.';
  if (!c.currency.trim()) return 'Currency is required.';
  if (!c.marketingTitle.en.trim()) return 'A marketing title is required.';
  return null;
}

/** Safe subset for the PUBLIC (signed-out) pricing section. Never includes capacity packages or anything internal. */
export interface PublicFormaPlan {
  key: typeof FORMA_ID;
  marketingTitle: LocalizedText;
  marketingDescription: LocalizedText;
  marketingFeatures: LocalizedTextList;
  priceMonthly: number;
  currency: string;
  billingInterval: 'month';
  maxClients: number;
  trialEnabled: boolean;
  trialDurationDays: number | null;
  trialClientLimit: number;
  signupEnabled: boolean;
}

export function toPublicForma(c: FormaConfigDoc): PublicFormaPlan {
  return {
    key: FORMA_ID,
    marketingTitle: c.marketingTitle,
    marketingDescription: c.marketingDescription,
    marketingFeatures: c.marketingFeatures,
    priceMonthly: c.priceMonthly,
    currency: c.currency,
    billingInterval: c.billingInterval,
    maxClients: c.maxClients,
    trialEnabled: c.trialEnabled,
    trialDurationDays: c.trialEnabled ? c.trialDurationDays : null,
    trialClientLimit: trialLimitOf(c),
    signupEnabled: c.signupEnabled,
  };
}

/** Full config for authenticated readers (coach My Plan, admin). `_id` → `key`. */
export type PublicFormaConfig = Omit<FormaConfigDoc, '_id'> & { key: typeof FORMA_ID };
export function toFormaConfig(c: FormaConfigDoc): PublicFormaConfig {
  const { _id, ...rest } = c;
  return { key: _id, ...rest };
}
