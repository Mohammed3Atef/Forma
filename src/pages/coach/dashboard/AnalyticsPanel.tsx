import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { BarChart } from '@/components/charts';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';

export function AnalyticsPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const cur = d.currency;
  const growth = [
    { label: t('coachDash.today'), value: d.newToday },
    { label: t('coachDash.thisWeek'), value: d.newWeek },
    { label: t('coachDash.thisMonth'), value: d.newMonth },
  ];

  return (
    <div className="space-y-6">
      <DashboardSection title={t('coachDash.revenue')} icon="bolt">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon="bolt" value={`${d.monthlyRevenue} ${cur}`} label={t('coachDash.monthlyRevenue')} tone="brand" />
          <MetricCard icon="chart" value={`${d.expectedRevenue} ${cur}`} label={t('coachDash.expectedRevenue')} tone="success" />
          <MetricCard icon="info" value={`${d.lostRevenue} ${cur}`} label={t('coachDash.lostRevenue')} tone={d.lostRevenue > 0 ? 'danger' : 'default'} />
          <MetricCard icon="calendar" value={`${d.expiring7} / ${d.expiring30}`} label={t('coachDash.expiring')} hint={t('coachDash.expiringHint')} tone={d.expiring7 > 0 ? 'warn' : 'default'} />
        </div>
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
