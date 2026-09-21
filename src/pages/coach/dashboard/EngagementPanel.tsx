import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';

/**
 * Fleet-wide engagement KPIs. The per-client "who's most/least active"
 * breakdown used to be duplicated here as a top-8 bar chart (same sort as
 * Reports' full ranking table, just less complete and with the misleading
 * last-bar "current" highlight) — removed in favor of one link to the real
 * ranking on the Reports page instead of showing two versions of it.
 */
export function EngagementPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const assessmentCompletion = d.totalClients ? Math.round((d.assessmentsReviewed / d.totalClients) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.workoutAdherence')} tone="brand" />
        <MetricCard icon="dumbbell" value={d.avgWorkouts7d} label={t('coachDash.avgWorkoutsLabel')} />
        <MetricCard icon="check" value={`${assessmentCompletion}%`} label={t('coachDash.assessmentCompletion')} hint={`${d.assessmentsReviewed}/${d.totalClients}`} />
        <MetricCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
        <MetricCard icon="chat" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} />
      </div>

      <DashboardSection
        title={t('coachDash.adherenceOverview')}
        icon="chart"
        action={<button type="button" className="sec-link" onClick={() => navigate('/coach/reports')}>{t('coachDash.viewFullRanking')}</button>}
      >
        <p className="text-sm text-earth-muted">{t('coachDash.rankingMovedHint')}</p>
      </DashboardSection>
    </div>
  );
}
