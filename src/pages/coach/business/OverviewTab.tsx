import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { businessAnalytics, type MethodRow } from '@/lib/coachAnalytics';
import { businessSummary } from '@/lib/coachBusiness';
import type { ClientState } from '@/lib/coachDirectory';
import { formatDate, formatEgpMinor, formatNumber } from '@/lib/format';
import { colors } from '@/theme/colors';
import { coachBusinessQuery } from '@/services/platform/coachBusinessApi';
import { coachPaymentsQuery } from '@/services/platform/clientPaymentsApi';
import { SegmentedControl } from '@/components/ui/Tabs';
import { TabState, type BusinessTabProps } from './parts';
import { BarList, BookedCollectedChart } from './charts';
import { Metric, MetricGroup } from '@/components/ui/Metric';

/** The package states worth a row, in the Clients filter order (each opens Clients with it). */
const STATE_ORDER: ClientState[] = ['active', 'trial', 'expiring', 'paused', 'expired', 'pending', 'none'];

/**
 * Business › Overview (B3.8 completion, owner decision 5): this month and overall in truthful
 * figures — booked (what clients agreed to) is never collected (what the coach recorded receiving),
 * a recorded payment is never "verified", and there is no profit (Forma does not know costs) —
 * then booked vs collected over twelve months, collections by method, the renewal pipeline, the
 * packages clients are on, and clients by package state. Every figure: `lib/coachAnalytics`.
 * Payments failing to load is partial data: the booked figures still show, the rest says so.
 */
export default function OverviewTab({ coachId }: BusinessTabProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const q = useQuery(coachBusinessQuery(coachId, qc));
  const pq = useQuery(coachPaymentsQuery(coachId));
  const [now] = useState(() => Date.now());
  const [methodScope, setMethodScope] = useState<'month' | 'all'>('month');
  const paymentsOk = pq.isSuccess;
  const a = useMemo(() => (q.data ? businessAnalytics(q.data.rels, pq.data ?? [], now) : null), [q.data, pq.data, now]);
  const s = useMemo(() => (q.data ? businessSummary(q.data.rels, now) : null), [q.data, now]);
  const money = (minor: number) => formatEgpMinor(minor, lang);
  const unknown = <span className="text-earth-subtle">—</span>;
  const from = a ? formatDate(a.month.start, lang, 'medium') : '';
  const to = a ? formatDate(a.month.end, lang, 'medium') : '';
  const methods: MethodRow[] = a ? (methodScope === 'month' ? a.methodsMonth : a.methodsAll) : [];

  return (
    <TabState q={q} testId="biz-overview">
      {a && s ? (
        <div className="space-y-6" data-testid="biz-overview">
          {!paymentsOk && !pq.isPending ? (
            <div role="alert" className="card flex flex-wrap items-center justify-between gap-2 border border-warn/40" data-testid="biz-payments-error">
              <p className="text-[13px] text-earth-muted">{t('business.paymentsFailed')}</p>
              <button type="button" className="btn-ghost btn-sm" onClick={() => void pq.refetch()}>{t('common.retry')}</button>
            </div>
          ) : null}

          <Section title={t('business.month.title')} action={<span className="text-[13px] text-earth-muted" data-testid="biz-month-range">{t('business.month.range', { from, to })}</span>} testId="biz-month">
            <MetricGroup>
              <Metric label={t('business.figure.bookedMonth')} value={money(a.bookedMonthMinor)} sub={t('business.month.terms', { count: a.bookedMonthTerms })} testId="biz-booked" />
              <Metric label={t('business.figure.collectedMonth')} value={paymentsOk ? money(a.collectedMonthMinor) : unknown} sub={paymentsOk ? t('business.figure.payments', { count: a.collectedMonthCount }) : t('business.figure.notLoaded')} testId="biz-collected" />
              <Metric label={t('business.figure.due')} value={money(a.dueMonthMinor)} sub={t('business.month.terms', { count: a.dueMonthTerms })} to="/coach/business?tab=renewals" testId="biz-due" />
              <Metric label={t('business.figure.lost')} value={money(a.lostMonthMinor)} sub={t('business.month.terms', { count: a.lostMonthTerms })} testId="biz-lost" />
            </MetricGroup>
            {paymentsOk && a.reversedMonthCount > 0 ? (
              <p className="mt-2 text-[12.5px] text-earth-muted" data-testid="biz-reversed">{t('business.figure.reversedMonth', { count: a.reversedMonthCount, amount: money(a.reversedMonthMinor) })}</p>
            ) : null}
          </Section>

          <Section title={t('business.overall.title')} testId="biz-overall">
            <MetricGroup>
              <Metric
                label={t('business.figure.outstanding')}
                value={paymentsOk ? money(a.outstandingMinor) : unknown}
                tone={paymentsOk && a.overdueMinor > 0 ? 'warn' : undefined}
                sub={
                  paymentsOk ? (
                    <>
                      <span className="block" data-testid="biz-overdue">{t('business.figure.overdue', { amount: money(a.overdueMinor) })}</span>
                      {a.notYetDueMinor > 0 ? <span className="block">{t('business.figure.notYetDue', { amount: money(a.notYetDueMinor) })}</span> : null}
                      {a.overpaidMinor > 0 ? <span className="block" data-testid="biz-credit">{t('business.figure.credit', { amount: money(a.overpaidMinor) })}</span> : null}
                    </>
                  ) : (
                    t('business.figure.notLoaded')
                  )
                }
                testId="biz-outstanding"
              />
              <Metric label={t('business.figure.bookedAll')} value={money(a.bookedAllMinor)} testId="biz-booked-all" />
              <Metric label={t('business.figure.collectedAll')} value={paymentsOk ? money(a.collectedAllMinor) : unknown} testId="biz-collected-all" />
              <Metric label={t('business.figure.activePaying')} value={formatNumber(a.activePaying, lang)} sub={t('business.figure.activePayingSub')} to="/coach/clients?state=active" testId="biz-active-paying" />
            </MetricGroup>
            {a.untrackedTerms > 0 || a.otherCurrencyTerms > 0 || (paymentsOk && a.unlinkedCount > 0) ? (
              <ul className="mt-2 space-y-0.5 text-[12.5px] text-earth-muted" data-testid="biz-coverage">
                {paymentsOk && a.unlinkedCount > 0 ? <li data-testid="biz-unlinked">{t('business.coverage.unlinked', { count: a.unlinkedCount, amount: money(a.unlinkedMinor) })}</li> : null}
                {a.untrackedTerms > 0 ? <li>{t('business.coverage.untracked', { count: a.untrackedTerms })}</li> : null}
                {a.otherCurrencyTerms > 0 ? <li>{t('business.coverage.otherCurrency', { count: a.otherCurrencyTerms })}</li> : null}
              </ul>
            ) : null}
          </Section>

          <div className="grid gap-6 xl:grid-cols-3">
            <Section title={t('business.chart.title')} className="xl:col-span-2" testId="biz-trend-section">
              <div className="card">
                <BookedCollectedChart points={paymentsOk ? a.trend : a.trend.map((p) => ({ ...p, collectedMinor: 0 }))} />
                {!paymentsOk ? <p className="mt-2 text-[12px] text-earth-subtle">{t('business.figure.collectedNotLoaded')}</p> : null}
              </div>
            </Section>
            <Section title={t('business.methods.title')} testId="biz-methods-section">
              <div className="card">
                <SegmentedControl
                  className="seg-quiet mb-4" /* a view switch inside the card: the heading row stays level with the chart's */
                  label={t('business.methods.scope')}
                  value={methodScope}
                  onChange={(v) => setMethodScope(v)}
                  options={[
                    { value: 'month' as const, label: t('business.methods.month') },
                    { value: 'all' as const, label: t('business.methods.all') },
                  ]}
                  testIdPrefix="biz-methods-scope"
                />
                {paymentsOk ? (
                  <BarList
                    testId="biz-methods"
                    color={colors.chartCollected}
                    empty={t('business.methods.empty')}
                    rows={methods.map((m) => ({ key: m.method, label: t(`payments.method.${m.method}`), value: m.minor, figure: money(m.minor), sub: t('business.figure.payments', { count: m.count }) }))}
                  />
                ) : (
                  <p className="text-[13px] text-earth-muted">{t('business.figure.notLoaded')}</p>
                )}
              </div>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            <Section title={t('business.pipeline.title')} testId="biz-pipeline-section">
              <div className="card">
                <BarList
                  testId="biz-pipeline"
                  color={colors.chartBooked}
                  empty={t('business.pipeline.empty')}
                  rows={a.pipeline.map((r) => ({
                    key: r.key,
                    label: t(`business.pipeline.${r.key}`),
                    value: r.count,
                    figure: t('business.pipeline.count', { count: r.count }),
                    sub: money(r.minor),
                    to: '/coach/business?tab=renewals',
                    ...(r.key === 'overdue' ? { status: 'warn' as const, icon: <Icon name="info" size={14} className="shrink-0 text-warn" /> } : {}),
                  }))}
                />
              </div>
            </Section>
            <Section title={t('business.packages.title')} testId="biz-packages-section">
              <div className="card">
                <BarList
                  testId="biz-package-mix"
                  color={colors.chartBooked}
                  empty={t('business.packages.empty')}
                  rows={a.packages.map((p, i) => ({
                    key: p.other ? 'other' : p.name ?? `custom-${i}`,
                    label: p.other ? t('business.packages.other') : p.name ? <bdi>{p.name}</bdi> : t('business.packages.custom'),
                    value: p.clients,
                    figure: t('business.packages.clients', { count: p.clients }),
                    sub: t('business.packages.value', { amount: money(p.minor) }),
                  }))}
                />
              </div>
            </Section>
            <Section title={t('business.counts.title')} testId="biz-counts">
              <ListGroup>
                {STATE_ORDER.filter((k) => s.counts[k] > 0).map((k) => (
                  <ListRow key={k} title={t(`coachClients.state.${k}`)} trailing={<span className="tabular-nums text-[15px] font-semibold" dir="ltr">{formatNumber(s.counts[k], lang)}</span>} to={`/coach/clients?state=${k}`} chevron testId={`biz-count-${k}`} />
                ))}
                {STATE_ORDER.every((k) => s.counts[k] === 0) ? <ListRow title={t('business.counts.empty')} testId="biz-count-empty" /> : null}
              </ListGroup>
            </Section>
          </div>

          <Section title={t('business.definitions.title')} testId="biz-definitions-section">
            <dl className="card grid gap-x-6 gap-y-2 text-[13px] leading-snug text-earth-muted md:grid-cols-2" data-testid="biz-definitions">
              {(['booked', 'collected', 'outstanding', 'due', 'lost', 'reversed', 'profit'] as const).map((k) => (
                <div key={k}>
                  <dt className="inline font-semibold text-earth">{t(`business.definitions.${k}.term`)}</dt> <dd className="inline">{t(`business.definitions.${k}.text`, { to })}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      ) : null}
    </TabState>
  );
}
