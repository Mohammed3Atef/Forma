import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
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
  const [open, setOpen] = useState(true);

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
          <div className="card divide-y divide-line-soft p-0">
            {rows
              .slice()
              .reverse()
              .map((r, i) => (
                <div key={i} className="rowline">
                  <span className="tk-ic"><Icon name="calendar" size={14} /></span>
                  <div className="grow min-w-0">
                    <p className="h3 flex items-center gap-1.5 truncate">
                      {r.months != null ? t('subscription.renewedMonths', { n: r.months }) : t('subscription.term')}
                      {r.current && <Pill tone="ok">{t('subscription.current')}</Pill>}
                    </p>
                    <p className="bd-s font-mono">{fmtDate(r.startAt)} → {fmtDate(r.endAt)}</p>
                  </div>
                  {r.price != null && (
                    <span className="shrink-0 font-mono text-[13px] font-medium text-earth">{r.price}{r.currency ? ` ${r.currency}` : ''}</span>
                  )}
                </div>
              ))}
          </div>
          <div className="flex items-center justify-between px-1 text-[13px] font-medium">
            <span>{t('subscription.totalMonths', { n: totalMonths })}</span>
            {totalPaid > 0 && <span>{t('subscription.totalPaid', { amount: `${totalPaid}${currency ? ` ${currency}` : ''}` })}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
