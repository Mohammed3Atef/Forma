import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { colors } from '@/theme/colors';
import { formatEgpCompact, formatEgpMinor, formatNumber, formatPercent } from '@/lib/format';
import type { TrendPoint } from '@/lib/coachAnalytics';

/**
 * Business analytics marks (B3.8 completion, owner decision 5) — plain HTML, no chart library:
 * thin bars (≤ 24 px, 4 px rounded data end, square at the baseline, 2 px gaps), hairline solid
 * grid, one axis, a legend whenever there are two series, every value reachable by keyboard and as
 * a table. Flex rows follow the page direction, so time reads right-to-left in Arabic.
 *
 * Series colours are the validated pair in `theme/colors` (`chartBooked` / `chartCollected`:
 * lightness band, chroma, CVD ΔE 24.5 and contrast all pass on the dark surface). Text never wears
 * a series colour.
 */

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />;
}

const monthLabel = (key: string, lang: string, style: 'short' | 'long') => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(lang.startsWith('ar') ? 'ar-EG-u-nu-latn' : 'en-GB-u-nu-latn', style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
};

/** Booked vs collected per month — two series on ONE axis (both EGP), with a table twin. */
export function BookedCollectedChart({ points }: { points: TrendPoint[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [asTable, setAsTable] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const tableId = useId();
  const max = Math.max(1, ...points.map((p) => Math.max(p.bookedMinor, p.collectedMinor)));
  // Round the axis top to a clean number (1 / 2 / 5 × 10ⁿ pounds).
  const top = (() => {
    const pounds = max / 100;
    const mag = 10 ** Math.floor(Math.log10(pounds));
    const step = [1, 2, 5, 10].find((f) => f * mag >= pounds) ?? 10;
    return step * mag * 100;
  })();
  const empty = points.every((p) => p.bookedMinor === 0 && p.collectedMinor === 0);
  const last = points.at(-1)?.key;
  const name = (p: TrendPoint) => `${monthLabel(p.key, lang, 'long')}${p.key === last ? ` (${t('business.chart.soFar')})` : ''}`;

  return (
    <div data-testid="biz-trend">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-earth-muted" aria-label={t('business.chart.legend')} data-testid="biz-trend-legend">
          <li className="flex items-center gap-1.5"><Swatch color={colors.chartBooked} />{t('business.figure.booked')}</li>
          <li className="flex items-center gap-1.5"><Swatch color={colors.chartCollected} />{t('business.figure.collected')}</li>
        </ul>
        <button type="button" className="hit-44 text-[12.5px] font-semibold text-brand-light hover:underline" aria-expanded={asTable} aria-controls={tableId} data-testid="biz-trend-table-toggle" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('business.chart.showChart') : t('business.chart.showTable')}
        </button>
      </div>
      {empty && !asTable ? (
        <p className="py-8 text-center text-[13px] text-earth-muted" data-testid="biz-trend-empty">{t('business.chart.empty')}</p>
      ) : asTable ? (
        <div className="overflow-x-auto" id={tableId}>
          <table className="w-full text-[13px]" data-testid="biz-trend-table">
            <caption className="sr-only">{t('business.chart.caption')}</caption>
            <thead>
              <tr className="text-start text-earth-subtle">
                <th scope="col" className="py-1.5 text-start font-medium">{t('business.chart.month')}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{t('business.figure.booked')}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{t('business.figure.collected')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {points.map((p) => (
                <tr key={p.key}>
                  <th scope="row" className="py-1.5 text-start font-normal text-earth-muted">{name(p)}</th>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatEgpMinor(p.bookedMinor, lang)}</td>
                  <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatEgpMinor(p.collectedMinor, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2" id={tableId}>
          {/* One axis: clean ticks, compact, hairline solid grid. */}
          <div className="flex h-[168px] w-12 shrink-0 flex-col justify-between pb-6 text-end text-[12px] tabular-nums text-earth-subtle" aria-hidden>
            <span dir="ltr">{formatEgpCompact(top / 100, lang)}</span>
            <span dir="ltr">{formatEgpCompact(top / 200, lang)}</span>
            <span dir="ltr">{formatEgpCompact(0, lang)}</span>
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[144px]" aria-hidden>
              <div className="absolute inset-x-0 top-[6px] border-t border-line-soft" />
              <div className="absolute inset-x-0 top-[75px] border-t border-line-soft" />
              <div className="absolute inset-x-0 top-[144px] border-t border-line" />
            </div>
            <ul className="relative flex h-[168px] items-stretch" aria-label={t('business.chart.caption')} data-testid="biz-trend-plot">
              {points.map((p, i) => {
                const h = (v: number) => (v <= 0 ? 0 : Math.max(2, Math.round((v / top) * 138)));
                const isFocus = focus === p.key;
                const label = `${name(p)}: ${t('business.figure.booked')} ${formatEgpMinor(p.bookedMinor, lang)}, ${t('business.figure.collected')} ${formatEgpMinor(p.collectedMinor, lang)}`;
                return (
                  <li
                    key={p.key}
                    tabIndex={0}
                    aria-label={label}
                    data-testid="biz-trend-month"
                    data-month={p.key}
                    className="group relative flex min-w-0 flex-1 cursor-default flex-col items-center outline-none"
                    onMouseEnter={() => setFocus(p.key)}
                    onMouseLeave={() => setFocus((f) => (f === p.key ? null : f))}
                    onFocus={() => setFocus(p.key)}
                    onBlur={() => setFocus((f) => (f === p.key ? null : f))}
                  >
                    <div className={`flex h-[144px] w-full items-end justify-center gap-[2px] rounded-t-md ${isFocus ? 'bg-surface-hover/60' : ''} group-focus-visible:ring-2 group-focus-visible:ring-ui-focus`}>
                      <span className="block w-[clamp(4px,30%,18px)] rounded-t-[4px]" style={{ height: h(p.bookedMinor), background: colors.chartBooked }} />
                      <span className="block w-[clamp(4px,30%,18px)] rounded-t-[4px]" style={{ height: h(p.collectedMinor), background: colors.chartCollected }} />
                    </div>
                    <span className={`mt-1.5 truncate text-[12px] text-earth-subtle ${i % 2 === 1 && i !== points.length - 1 ? 'max-sm:invisible' : ''}`} aria-hidden>
                      {monthLabel(p.key, lang, 'short')}
                    </span>
                    {isFocus ? (
                      <div className="pointer-events-none absolute bottom-[calc(100%-18px)] z-10 w-max max-w-[220px] -translate-y-2 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-[12px] shadow-deep" role="status" style={i > points.length / 2 ? { insetInlineEnd: 0 } : { insetInlineStart: 0 }}>
                        <p className="font-medium text-earth">{name(p)}</p>
                        <p className="flex items-center gap-1.5 text-earth-muted"><Swatch color={colors.chartBooked} />{t('business.figure.booked')} <span className="ms-auto ps-2 tabular-nums text-earth" dir="ltr">{formatEgpMinor(p.bookedMinor, lang)}</span></p>
                        <p className="flex items-center gap-1.5 text-earth-muted"><Swatch color={colors.chartCollected} />{t('business.figure.collected')} <span className="ms-auto ps-2 tabular-nums text-earth" dir="ltr">{formatEgpMinor(p.collectedMinor, lang)}</span></p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  /** Bar length (same unit for every row). */
  value: number;
  /** What the row says at its end. */
  figure: ReactNode;
  sub?: ReactNode;
  to?: string;
  /** A status row (e.g. overdue) — status colour WITH its label and icon, never colour alone. */
  status?: 'warn';
  icon?: ReactNode;
}

/** One series as horizontal bars — magnitude by length, one hue, labels and values in text. */
export function BarList({ rows, color, testId, empty }: { rows: BarRow[]; color: string; testId: string; empty: string }) {
  const { i18n } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (rows.every((r) => r.value === 0)) return <p className="text-[13px] text-earth-muted" data-testid={`${testId}-empty`}>{empty}</p>;
  return (
    <ul className="space-y-3" data-testid={testId}>
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-1.5 break-words text-earth">
                {r.icon}
                {r.label}
              </span>
              <span className="shrink-0 tabular-nums text-earth" dir="ltr">{r.figure}</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-strong" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${r.value <= 0 ? 0 : Math.max(2, (r.value / max) * 100)}%`, background: r.status === 'warn' ? colors.warning : color }} />
            </div>
            {r.sub ? <p className="mt-1 text-[12px] text-earth-subtle">{r.sub}</p> : total > 0 && r.value > 0 ? <p className="mt-1 text-[12px] text-earth-subtle">{formatPercent((r.value / total) * 100, i18n.language)}</p> : null}
          </>
        );
        return (
          <li key={r.key} data-testid={`${testId}-row`} data-key={r.key}>
            {r.to ? (
              <Link to={r.to} className="-mx-2 block rounded-lg px-2 py-1 transition-colors hover:bg-surface-hover">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const count = (n: number, lang: string) => formatNumber(n, lang);
