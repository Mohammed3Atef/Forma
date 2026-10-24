import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Metric, MetricGroup } from '@/components/ui/Metric';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, StaleNotice, useQueryScreen } from '@/components/ui/ScreenState';
import { LineChart } from '@/components/charts';
import { clientWeightLogsQuery } from '@/services/platform/coachApi';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * Workspace › Progress › Body — the bodyweight half (B3.9 rebuild): the latest weigh-in and the change
 * over the logged period as one metric group, the trend, and the exact entries. A failed or offline
 * read is said, never shown as "no data" (CO-18). Measurements follow in `CoachViewMeasurements`.
 */
export function CoachViewProgress({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const weightsQ = useQuery(clientWeightLogsQuery(clientId)); // B3.9 (PF-07): shared with the header and Summary
  const screen = useQueryScreen(weightsQ, (d) => d.length === 0);

  // Newest first from the API; the chart reads oldest → newest.
  const weights = useMemo(() => weightsQ.data ?? [], [weightsQ.data]);
  const trend = useMemo(() => [...weights].reverse().map((w) => ({ date: w.date, value: w.weightKg })), [weights]);
  const latest = weights[0];
  const first = trend[0];
  const delta = trend.length >= 2 ? Math.round((trend[trend.length - 1].value - first.value) * 10) / 10 : null;
  const kg = t('common.kg');

  if (screen.status === 'loading') return <div className="sk h-48 rounded-ui-surface" aria-busy="true" />;
  if (screen.status === 'offline') return <OfflineState onRetry={screen.retry} testId="body-weights-offline" />;
  if (screen.status === 'error') return <ErrorState message={t('coachView.bodyFailed')} onRetry={screen.retry} testId="body-weights-error" />;
  if (screen.status === 'empty') return <p className="py-6 text-center text-[14px] text-earth-muted" data-testid="body-weights-empty">{t('coachView.noProgress')}</p>;

  return (
    <section className="space-y-4" data-testid="body-weights">
      {screen.stale ? <StaleNotice online={screen.online} /> : null}
      <MetricGroup cols={2}>
        <Metric
          label={t('coach.lastWeight')}
          value={latest ? formatNumber(latest.weightKg, lang) : '—'}
          unit={latest ? kg : undefined}
          sub={latest ? formatDate(latest.date, lang, 'medium') : undefined}
          testId="body-latest-weight"
        />
        <Metric
          label={t('coachView.weightChange')}
          value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${formatNumber(delta, lang)}`}
          unit={delta == null ? undefined : kg}
          sub={delta == null || !first ? undefined : t('coachView.sinceDate', { date: formatDate(first.date, lang, 'medium') })}
          testId="body-weight-change"
        />
      </MetricGroup>

      <div className="card">
        <h2 className="mb-2 text-[17px] font-semibold">{t('gt.bodyweight')}</h2>
        <LineChart data={trend} unit={kg} emptyLabel={t('progress.noData')} locale={lang} />
        <ul className="mt-3 divide-y divide-white/[0.06] text-[14px]" data-testid="body-weight-list">
          {weights.slice(0, 20).map((w) => (
            <li key={w.id} className="flex items-center justify-between py-1.5">
              <span className="text-earth-muted">{formatDate(w.date, lang, 'medium')}</span>
              <span className="tabular-nums">
                <bdi dir="ltr">{formatNumber(w.weightKg, lang)}</bdi> {kg}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
