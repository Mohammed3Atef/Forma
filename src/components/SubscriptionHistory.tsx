import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import type { Subscription, SubscriptionPeriod } from '@/types';
import { formatDate, formatMoney } from '@/lib/format';
import { termFirstDay, termLastDay, termLengthDays } from '@/lib/subscription';

interface Row {
  startAt: number;
  endAt: number;
  startDate?: string;
  endDate?: string;
  zone?: string;
  months?: number;
  days?: number;
  price?: number;
  currency?: string;
  current?: boolean;
  renewed?: boolean;
}

/**
 * Read-only subscription history shared by the coach panel and the client card: every past term
 * plus the current one — first and last day (B3.8: calendar days, the end shown inclusive), length
 * and package price — with the totals. B3.8: the total is what the packages cost, never "paid":
 * Forma does not see money change hands (coaches record payments separately). Amounts in different
 * currencies (pre-B3.8 test data only) are never added together. Renders nothing without a term.
 */
export function SubscriptionHistory({ sub, history }: { sub?: Subscription | null; history?: SubscriptionPeriod[] }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(true);
  const day = (key: string) => formatDate(key, i18n.language, 'medium');

  const rows: Row[] = (history ?? []).map((h) => ({ ...h, renewed: h.archivedBy === 'renew' }));
  if (sub && sub.status !== 'pending') rows.push({ ...sub, current: true });
  if (rows.length === 0) return null;

  const lengthOf = (r: Row) => (r.days != null || r.months != null ? termLengthDays({ days: r.days ?? null, months: r.months ?? null }) : null);
  const totalDays = rows.reduce((n, r) => n + (lengthOf(r) ?? 0), 0);
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (r.price == null) continue;
    const c = (r.currency ?? '').trim().toUpperCase() || 'EGP';
    totals.set(c, (totals.get(c) ?? 0) + r.price);
  }
  const totalText = [...totals.entries()].filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c, i18n.language)).join(' · ');

  return (
    <div className="space-y-2">
      <button type="button" className="inline-flex min-h-ui-hit items-center text-[13px] font-medium text-brand-light" data-testid="sub-history-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? t('subscription.hideHistory') : t('subscription.viewHistory', { n: rows.length })}
      </button>
      {open && (
        <div className="space-y-2" data-testid="sub-history">
          {/* B3.9 (CD-03): inside a package card the rows are a hairline group, not a card in a card. */}
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-ui-control border border-white/[0.07]">
            {rows
              .slice()
              .reverse()
              .map((r, i) => {
                const len = lengthOf(r);
                return (
                  <div key={i} className="rowline">
                    <span className="tk-ic"><Icon name="calendar" size={14} /></span>
                    <div className="grow min-w-0">
                      <p className="flex items-center gap-1.5 truncate">
                        {len != null ? t('subscription.lengthDays', { count: len }) : t('subscription.term')}
                        {r.current && <Pill tone="ok">{t('subscription.current')}</Pill>}
                        {r.renewed && <Pill tone="mute">{t('subscription.renewedPill')}</Pill>}
                      </p>
                      <p className="tabular-nums text-earth-muted">
                        {day(termFirstDay(r))} → {day(termLastDay(r))}
                      </p>
                    </div>
                    {r.price != null && (
                      <span className="shrink-0 text-[13px] font-medium tabular-nums text-earth" dir="ltr">{formatMoney(r.price, r.currency, i18n.language)}</span>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[13px] font-medium">
            <span>{t('subscription.totalDays', { count: totalDays })}</span>
            {totalText && <span data-testid="sub-history-total">{t('subscription.packagesTotal', { amount: totalText })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
