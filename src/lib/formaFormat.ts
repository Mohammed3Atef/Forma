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

const DAY_MS = 86_400_000;

/**
 * Preview of what confirming a subscription request will do — mirrors the
 * server's `computeTermStart`: a RENEWAL of a paid term starts at
 * max(current end, now) (an early renewal is appended, never loses days);
 * a first activation starts now. Display only — the server decides.
 */
export function termPreview(
  plan: { phase?: string; plan?: string; endsAt: number | null } | null | undefined,
  type: string,
  termDays: number,
  now = Date.now(),
): { start: number; end: number; extended: boolean; currentEndsAt: number | null } {
  const paid = !!plan && (plan.phase ?? (plan.plan === 'trial' ? 'trial' : 'forma')) === 'forma';
  const extended = type === 'renewal' && paid && plan!.endsAt != null && plan!.endsAt > now;
  const start = extended ? plan!.endsAt! : now;
  return { start, end: start + termDays * DAY_MS, extended, currentEndsAt: plan?.endsAt ?? null };
}

/** Super Admin "Renew Forma" confirmation copy — says exactly where the new term starts and ends. */
export function renewConfirmMessage(
  t: (k: string, o?: Record<string, unknown>) => string,
  lang: string,
  args: { name: string; plan: { phase?: string; plan?: string; state?: string; endsAt: number | null } | null | undefined; price: number | string; currency: string; termDays: number; maxClients: number | string },
): string {
  const active = args.plan?.state === 'active';
  const p = termPreview(args.plan, active ? 'renewal' : 'subscription', args.termDays);
  return p.extended
    ? t('forma.admin.renewBodyExtend', { name: args.name, price: args.price, currency: args.currency, n: args.maxClients, ends: fmtDate(p.currentEndsAt!, lang), through: fmtDate(p.end, lang) })
    : t('forma.admin.renewBody', { name: args.name, price: args.price, currency: args.currency, days: args.termDays, n: args.maxClients, through: fmtDate(p.end, lang) });
}
