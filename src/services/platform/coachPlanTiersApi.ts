import { trpc } from '@/services/trpc';
import type { TFunction } from 'i18next';
import { writeAudit } from './auditApi';
import type { CoachPlanTierConfig, LocalizedText, LocalizedTextList, PublicPlanTier } from '@/types';

/**
 * Admin-editable coach plan tiers (Layer A pricing/limits), backed by the
 * Mongo `coachPlanTiers` collection via tRPC (was `/api/plan-tiers/*`).
 * `coachPlanTiers.list` already merges the always-present built-in seed
 * (just `trial` — every other tier, e.g. "Pro", is created entirely from the
 * dashboard) with any Mongo overrides/customs server-side (see
 * `api/coach-plans/_handlers/tiers-data.ts`), so this file no longer needs
 * its own seed/merge logic. `trial` is a protected built-in — don't archive it.
 */

/** Display label for a tier key: explicit label → built-in i18n → the key itself. */
export function tierLabel(tiers: CoachPlanTierConfig[], key: string | null | undefined, t: TFunction): string {
  if (!key || key === 'none') return t('adminCoaches.tier.none', { defaultValue: '—' });
  const cfg = tiers.find((x) => x.key === key);
  if (cfg?.label) return cfg.label;
  return t(`adminCoaches.tier.${key}`, { defaultValue: key });
}

/** Built-in seed + Mongo overrides/customs (server-merged). Sorted by order. */
export async function listCoachPlanTiers(includeArchived = false): Promise<CoachPlanTierConfig[]> {
  return trpc.coachPlanTiers.list.query({ includeArchived });
}

export async function getCoachPlanTier(key: string): Promise<CoachPlanTierConfig | null> {
  const tiers = await listCoachPlanTiers(true);
  return tiers.find((tr) => tr.key === key) ?? null;
}

/** Signed-out Marketing pricing section + signup plan picker — safe subset only, sorted by `order`. */
export async function getPublicPlanTiers(): Promise<PublicPlanTier[]> {
  return trpc.coachPlanTiers.public.query();
}

/**
 * Shared "Core features" — shown on EVERY plan card (Trial and every paid
 * tier alike). Edited ONCE from the dashboard rather than re-typed per tier;
 * a tier's own `marketingFeatures` covers only what that tier adds on top.
 */
export async function getCoreFeatures(): Promise<LocalizedTextList> {
  return trpc.coachPlanTiers.coreFeatures.query();
}

/** Super-admin: replace the shared Core features list (both languages required). */
export async function saveCoreFeatures(features: LocalizedTextList): Promise<void> {
  await trpc.coachPlanTiers.saveCoreFeatures.mutate(features);
  await writeAudit({ action: 'coachPlanTier.saveCoreFeatures', targetUserId: 'pricing', metadata: {} });
}

/** Super-admin: create or update a tier (deterministic doc id = key). */
export async function saveCoachPlanTier(input: {
  key: string;
  label?: string;
  maxClients: number;
  priceMonthly: number;
  currency?: string;
  order?: number;
  active?: boolean;
  archived?: boolean;
  publicVisible?: boolean;
  signupEnabled?: boolean;
  highlighted?: boolean;
  isDefaultSignupPlan?: boolean;
  /**
   * Both languages required by the shared `LocalizedText`/`LocalizedTextList`
   * types, but the admin only has to TYPE English — a blank Arabic field (or
   * list) is filled in from the English value below, so a plan is never
   * partially untranslated on the public pricing page.
   */
  marketingTitle?: { en: string; ar?: string };
  marketingDescription?: { en: string; ar?: string };
  marketingFeatures?: { en: string[]; ar?: string[] };
  requiresPaymentConfirmation?: boolean;
  trialDurationDays?: number;
}): Promise<void> {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!key) throw new Error('A tier key is required.');
  const withArFallback = (v?: { en: string; ar?: string }): LocalizedText | undefined =>
    v?.en.trim() ? { en: v.en.trim(), ar: v.ar?.trim() || v.en.trim() } : undefined;
  // Sent whenever the form field is present at all (even an empty list) —
  // an admin clearing out all of a tier's own extra/"premium" features is a
  // deliberate edit, not "leave it as it was".
  const withArListFallback = (v?: { en: string[]; ar?: string[] }): LocalizedTextList | undefined =>
    v ? { en: v.en, ar: v.ar?.length ? v.ar : v.en } : undefined;
  await trpc.coachPlanTiers.save.mutate({
    key,
    label: (input.label ?? '').trim(),
    maxClients: Math.max(0, Math.floor(input.maxClients || 0)),
    priceMonthly: Math.max(0, Math.round(input.priceMonthly || 0)),
    currency: input.currency?.trim() || 'EGP',
    order: input.order,
    active: input.active ?? true,
    archived: input.archived,
    publicVisible: input.publicVisible,
    signupEnabled: input.signupEnabled,
    highlighted: input.highlighted,
    isDefaultSignupPlan: input.isDefaultSignupPlan,
    marketingTitle: withArFallback(input.marketingTitle),
    marketingDescription: withArFallback(input.marketingDescription),
    marketingFeatures: withArListFallback(input.marketingFeatures),
    requiresPaymentConfirmation: input.requiresPaymentConfirmation,
    trialDurationDays: input.trialDurationDays,
  });
  await writeAudit({ action: 'coachPlanTier.save', targetUserId: key, metadata: { key } });
}

/**
 * Super-admin: archive (soft-delete) a tier. `trial` is protected.
 * `PUT /plan-tiers/:tierKey` is a full replace (`maxClients`/`priceMonthly`
 * are required by its body schema), so this reads the current config first
 * to preserve its existing fields rather than clobbering them with defaults.
 */
export async function archiveCoachPlanTier(key: string): Promise<void> {
  if (key === 'trial') throw new Error('The trial tier cannot be removed.');
  const current = await getCoachPlanTier(key);
  await trpc.coachPlanTiers.save.mutate({
    key,
    label: current?.label ?? '',
    maxClients: current?.maxClients ?? 0,
    priceMonthly: current?.priceMonthly ?? 0,
    currency: current?.currency ?? 'EGP',
    order: current?.order,
    active: false,
    archived: true,
  });
  await writeAudit({ action: 'coachPlanTier.archive', targetUserId: key, metadata: { key } });
}
