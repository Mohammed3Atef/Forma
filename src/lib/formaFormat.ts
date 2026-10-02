import { useTranslation } from 'react-i18next';
import type { CapacitySnapshot } from '@/types';

/** "3 Oct 2026" / Arabic equivalent. */
export const fmtDate = (at: number, lang: string) =>
  new Date(at).toLocaleDateString(lang.startsWith('ar') ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "199 EGP / month", "199 EGP / 3 months" or "199 EGP one-time". */
export function useCapacityPrice() {
  const { t } = useTranslation();
  return (s: Pick<CapacitySnapshot, 'price' | 'currency' | 'billingInterval' | 'durationMonths'>) =>
    s.billingInterval === 'one_time'
      ? t('forma.capacity.priceOneTime', { price: s.price, currency: s.currency })
      : (s.durationMonths ?? 1) > 1
        ? t('forma.capacity.priceMonths', { price: s.price, currency: s.currency, n: s.durationMonths })
        : t('forma.capacity.priceMonthly', { price: s.price, currency: s.currency });
}

/** "Trial" / "Forma" / "—" for a coach plan (there are no tiers — only the phase of the one product). */
export function planPhaseLabel(plan: { phase?: string; plan?: string } | null | undefined, t: (k: string) => string): string {
  if (!plan) return '—';
  return t((plan.phase ?? (plan.plan === 'trial' ? 'trial' : 'forma')) === 'trial' ? 'forma.phase.trial' : 'forma.phase.forma');
}
