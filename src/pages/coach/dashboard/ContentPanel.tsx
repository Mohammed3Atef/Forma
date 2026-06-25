import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import { QuickAction } from './parts';

export function ContentPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="list" value={d.templatesCreated} label={t('coachDash.templates')} onClick={() => navigate('/coach/templates')} />
        <MetricCard icon="dumbbell" value={t('coachLib.tabs.exercises')} label={t('coachLib.title')} onClick={() => navigate('/coach/library?tab=exercises')} />
        <MetricCard icon="meal" value={t('coachLib.tabs.foods')} label={t('coachLib.title')} onClick={() => navigate('/coach/library?tab=foods')} />
        <MetricCard icon="check" value={d.assessmentsReviewed} label={t('coachDash.assessmentsReviewed')} onClick={() => navigate('/coach/assessments')} />
      </div>

      <DashboardSection title={t('coachDash.openLibrary')} icon="dumbbell">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <QuickAction icon="dumbbell" label={t('coachLib.tabs.exercises')} onClick={() => navigate('/coach/library?tab=exercises')} />
          <QuickAction icon="meal" label={t('coachLib.tabs.foods')} onClick={() => navigate('/coach/library?tab=foods')} />
          <QuickAction icon="list" label={t('coachLib.tabs.groups')} onClick={() => navigate('/coach/library?tab=groups')} />
          <QuickAction icon="pill" label={t('coachLib.tabs.supplements')} onClick={() => navigate('/coach/library?tab=supplements')} />
          <QuickAction icon="plus" label={t('coachDash.createTemplate')} onClick={() => navigate('/coach/templates/new')} />
        </div>
      </DashboardSection>
    </div>
  );
}
