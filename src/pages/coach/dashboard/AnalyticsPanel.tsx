import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MobileCardList } from '@/components/ui/MobileCardList';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart } from '@/components/charts';
import { shortDate } from '@/lib/utils';
import type { CoachDashboard, RenewalEntry } from '@/services/platform/coachDashboardApi';

export function AnalyticsPanel({ d }: { d: CoachDashboard }) {
  const { t, i18n } = useTranslation();
  const cur = d.currency;
  const fmt = (ms: number) => shortDate(new Date(ms).toISOString().slice(0, 10), i18n.language);
  const growth = [
    { label: t('coachDash.today'), value: d.newToday },
    { label: t('coachDash.thisWeek'), value: d.newWeek },
    { label: t('coachDash.thisMonth'), value: d.newMonth },
  ];

  const renewalCols: Column<RenewalEntry>[] = [
    { key: 'name', header: t('coach.clients'), cell: (r) => <span className="truncate font-medium">{r.name}</span> },
    { key: 'date', header: t('coachDash.renewalDate'), cell: (r) => <span className="font-mono text-[13px]">{fmt(r.date)}</span> },
    { key: 'amount', header: t('coachDash.renewalAmount'), cell: (r) => <span className="font-mono">{r.amount} {r.currency}</span>, className: 'text-end' },
  ];

  return (
    <div className="space-y-6">
      {/* Revenue = calendar-month cash flow (each client's full term price in the month they renew). */}
      <DashboardSection title={t('coachDash.revenue')} icon="bolt">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon="bolt" value={`${d.revenueThisMonth} ${cur}`} label={t('coachDash.revenueThisMonth')} hint={t('coachDash.revenueHint')} tone="brand" />
          <MetricCard icon="check" value={`${d.collectedThisMonth} ${cur}`} label={t('coachDash.collectedThisMonth')} tone="success" />
          <MetricCard icon="chart" value={`${d.dueThisMonth} ${cur}`} label={t('coachDash.dueThisMonth')} tone={d.dueThisMonth > 0 ? 'warn' : 'default'} />
          <MetricCard icon="info" value={`${d.lapsedThisMonth} ${cur}`} label={t('coachDash.lapsedThisMonth')} tone={d.lapsedThisMonth > 0 ? 'danger' : 'default'} />
        </div>
      </DashboardSection>

      {/* Per-client renewals breakdown — who renews when + how much (clients don't all pay on the same day). */}
      <DashboardSection
        title={t('coachDash.renewalsTitle')}
        icon="calendar"
        action={<span className="chip text-[11px]" title={t('coachDash.expiring')}>{d.expiring7} / {d.expiring30}</span>}
      >
        {d.renewals.length === 0 ? (
          <EmptyState icon="calendar" title={t('coachDash.noRenewals')} />
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable caption={t('coachDash.renewalsTitle')} columns={renewalCols} rows={d.renewals} rowKey={(r) => r.clientId} />
            </div>
            <div className="lg:hidden">
              <MobileCardList
                items={d.renewals}
                rowKey={(r) => r.clientId}
                renderItem={(r) => (
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    <span className="shrink-0 font-mono text-[12px] text-earth-subtle">{fmt(r.date)}</span>
                    <span className="shrink-0 font-mono text-sm">{r.amount} {r.currency}</span>
                  </div>
                )}
              />
            </div>
          </>
        )}
      </DashboardSection>

      <DashboardSection title={t('coachDash.subscriptions')} icon="user">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon="timer" value={d.subs.trial} label={t('subscription.status.trial')} />
          <MetricCard icon="check" value={d.subs.active} label={t('subscription.status.active')} tone="brand" />
          <MetricCard icon="info" value={d.subs.pending} label={t('subscription.status.pending')} tone={d.subs.pending > 0 ? 'warn' : 'default'} />
          <MetricCard icon="info" value={d.subs.expired} label={t('subscription.status.expired')} tone={d.subs.expired > 0 ? 'danger' : 'default'} />
          <MetricCard icon="pause" value={d.subs.frozen} label={t('subscription.status.frozen')} />
          <MetricCard icon="close" value={d.subs.cancelled} label={t('subscription.status.cancelled')} tone={d.subs.cancelled > 0 ? 'danger' : 'default'} />
        </div>
      </DashboardSection>

      <DashboardSection title={t('coachDash.growth')} icon="activity">
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className="grid grid-cols-3 gap-3">
            <MetricCard icon="plus" value={d.newMonth} label={t('coachDash.newClients')} hint={t('coachDash.newHint', { today: d.newToday, week: d.newWeek })} />
            <MetricCard icon="target" value={`${d.retention.d30}%`} label={t('coachDash.retention')} hint={`7d ${d.retention.d7}% · 90d ${d.retention.d90}%`} tone="brand" />
            <MetricCard icon="activity" value={`${d.churn.d30}%`} label={t('coachDash.churn')} hint={`7d ${d.churn.d7}% · 90d ${d.churn.d90}%`} tone={d.churn.d30 > 0 ? 'danger' : 'default'} />
          </div>
          <div className="card">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-earth-muted">{t('coachDash.clientGrowth')}</p>
            <BarChart data={growth} />
          </div>
        </div>
      </DashboardSection>
    </div>
  );
}
