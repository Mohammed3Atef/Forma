import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { QuickActionsGrid, QuickActionsTrigger, type QuickAction } from '@/components/ui/QuickActions';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';

export function ContentPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const quickActions: QuickAction[] = [
    { key: 'exercises', icon: 'dumbbell', label: t('coachLib.tabs.exercises'), onClick: () => navigate('/coach/library?tab=exercises') },
    { key: 'foods', icon: 'meal', label: t('coachLib.tabs.foods'), onClick: () => navigate('/coach/library?tab=foods') },
    { key: 'groups', icon: 'list', label: t('coachLib.tabs.groups'), onClick: () => navigate('/coach/library?tab=groups') },
    { key: 'supplements', icon: 'pill', label: t('coachLib.tabs.supplements'), onClick: () => navigate('/coach/library?tab=supplements') },
    { key: 'new-template', icon: 'plus', label: t('coachDash.createTemplate'), onClick: () => navigate('/coach/templates/new') },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="list" value={d.templatesCreated} label={t('coachDash.templates')} onClick={() => navigate('/coach/templates')} />
        <MetricCard icon="dumbbell" value={t('coachLib.tabs.exercises')} label={t('coachLib.title')} onClick={() => navigate('/coach/library?tab=exercises')} />
        <MetricCard icon="meal" value={t('coachLib.tabs.foods')} label={t('coachLib.title')} onClick={() => navigate('/coach/library?tab=foods')} />
        <MetricCard icon="check" value={d.assessmentsReviewed} label={t('coachDash.assessmentsReviewed')} onClick={() => navigate('/coach/assessments')} />
      </div>

      <DashboardSection
        title={t('coachDash.openLibrary')}
        icon="dumbbell"
        action={<QuickActionsTrigger actions={quickActions} title={t('coachDash.openLibrary')} />}
      >
        <QuickActionsGrid actions={quickActions} />
      </DashboardSection>
    </div>
  );
}
