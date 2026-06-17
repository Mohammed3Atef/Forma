import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Subscription, SubscriptionPeriod } from '@/types';

const fmtDate = (ms?: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');

interface Row {
  startAt: number;
  endAt: number;
  months?: number;
  price?: number;
  currency?: string;
  current?: boolean;
}

/**
 * Read-only subscription history shared by the coach panel and the client card:
 * every past term plus the current one, with total months + total amount paid.
 * Renders nothing when there's no subscription at all.
 */
export function SubscriptionHistory({ sub, history }: { sub?: Subscription | null; history?: SubscriptionPeriod[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const rows: Row[] = [...(history ?? [])];
  if (sub) rows.push({ startAt: sub.startAt, endAt: sub.endAt, months: sub.months, price: sub.price, currency: sub.currency, current: true });
  if (rows.length === 0) return null;

  const totalMonths = rows.reduce((n, r) => n + (r.months ?? 0), 0);
  const totalPaid = rows.reduce((n, r) => n + (r.price ?? 0), 0);
  const currency = rows.find((r) => r.currency)?.currency ?? '';

  return (
    <div className="space-y-2">
      <button type="button" className="text-[13px] font-medium text-brand-light" data-testid="sub-history-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? t('subscription.hideHistory') : t('subscription.viewHistory', { n: rows.length })}
      </button>
      {open && (
        <div className="space-y-2" data-testid="sub-history">
          <ul className="space-y-1.5 text-[13px]">
            {rows
              .slice()
              .reverse()
              .map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-line-soft pb-1.5 last:border-0">
                  <span className="font-mono text-[12px] text-earth-subtle">{fmtDate(r.startAt)} → {fmtDate(r.endAt)}</span>
                  <span className="flex items-center gap-2">
                    {r.months != null && <span className="text-earth-muted">{t('subscription.monthsShort', { n: r.months })}</span>}
                    {r.price != null && <span className="font-medium">{r.price}{r.currency ? ` ${r.currency}` : ''}</span>}
                    {r.current && <span className="chip border-success/50 text-success">{t('subscription.current')}</span>}
                  </span>
                </li>
              ))}
          </ul>
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span>{t('subscription.totalMonths', { n: totalMonths })}</span>
            {totalPaid > 0 && <span>{t('subscription.totalPaid', { amount: `${totalPaid}${currency ? ` ${currency}` : ''}` })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
