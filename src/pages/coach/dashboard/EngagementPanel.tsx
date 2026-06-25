import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart } from '@/components/charts';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import { firstName } from './parts';

export function EngagementPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const assessmentCompletion = d.totalClients ? Math.round((d.assessmentsReviewed / d.totalClients) * 100) : 0;
  const chart = useMemo(
    () =>
      [...d.clients]
        .sort((a, b) => b.workouts7d - a.workouts7d)
        .slice(0, 8)
        .map((c) => ({ label: firstName(c.client.displayName || c.client.email), value: c.workouts7d })),
    [d.clients],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.workoutAdherence')} tone="brand" />
        <MetricCard icon="dumbbell" value={d.avgWorkouts7d} label={t('coachDash.avgWorkoutsLabel')} />
        <MetricCard icon="check" value={`${assessmentCompletion}%`} label={t('coachDash.assessmentCompletion')} hint={`${d.assessmentsReviewed}/${d.totalClients}`} />
        <MetricCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
        <MetricCard icon="chat" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} />
      </div>

      <DashboardSection title={t('coachDash.adherenceOverview')} icon="chart">
        {chart.length === 0 || chart.every((c) => c.value === 0) ? (
          <EmptyState icon="chart" title={t('coachDash.noClients')} />
        ) : (
          <div className="card">
            <BarChart data={chart} />
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
