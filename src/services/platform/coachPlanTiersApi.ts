import { trpc } from '@/services/trpc';
import type { FormaConfig, LocalizedText, LocalizedTextList, PublicFormaPlan } from '@/types';

/**
 * The ONE Forma product configuration (`coachPlanTiers.*`, name kept for
 * wire compatibility). Nothing here is hardcoded in the UI — the marketing
 * card, signup copy, My Plan and the admin form all read this.
 */

/** Signed-out pricing card. `null` when the Super Admin hides Forma from the public site. */
export async function getPublicForma(): Promise<PublicFormaPlan | null> {
  const list = await trpc.coachPlanTiers.public.query();
  return list[0] ?? null;
}

/** Full config (any signed-in user). */
export async function getFormaConfig(): Promise<FormaConfig> {
  return trpc.coachPlanTiers.get.query();
}

export type FormaConfigInput = Omit<FormaConfig, 'key' | 'billingInterval' | 'createdAt' | 'updatedAt'>;

/**
 * Super-admin save. A blank Arabic field / list falls back to English so the
 * public card is never half-translated. Returns how many existing coaches
 * had their base limit raised (a lower limit never reduces anyone).
 */
export async function saveFormaConfig(input: FormaConfigInput): Promise<{ config: FormaConfig; raisedTrialCoaches: number; raisedPaidCoaches: number }> {
  const lt = (v: LocalizedText): LocalizedText => ({ en: v.en.trim(), ar: v.ar.trim() || v.en.trim() });
  const ll = (v: LocalizedTextList): LocalizedTextList => {
    const en = v.en.map((x) => x.trim()).filter(Boolean);
    const ar = v.ar.map((x) => x.trim()).filter(Boolean);
    return { en, ar: ar.length ? ar : en };
  };
  return trpc.coachPlanTiers.save.mutate({
    ...input,
    marketingTitle: lt(input.marketingTitle),
    marketingDescription: lt(input.marketingDescription),
    marketingFeatures: ll(input.marketingFeatures),
  });
}

/** Locale-aware pick from a bilingual field. */
export function pickLocalized(v: LocalizedText | null | undefined, lang: string): string {
  if (!v) return '';
  return (lang.startsWith('ar') ? v.ar : v.en) || v.en || v.ar || '';
}
