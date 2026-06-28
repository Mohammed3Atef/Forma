import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tabs, useTabParam, type TabDef } from '@/components/ui/Tabs';
import { LoadingState } from '@/components/ui/LoadingState';
import { useSession } from '@/services/auth/sessionStore';
import { useFullBleed } from '@/hooks/useFullBleed';
import { getCoachDashboard } from '@/services/platform/coachDashboardApi';
import { getCoachPlan } from '@/services/platform/coachPlanApi';
import { checkTrialExpiry } from '@/services/platform/coachTrialApi';
import { CoachTrialBanner } from '@/pages/coach/onboarding/CoachTrialBanner';
import { OverviewPanel } from '@/pages/coach/dashboard/OverviewPanel';
import { AnalyticsPanel } from '@/pages/coach/dashboard/AnalyticsPanel';
import { ClientsPanel } from '@/pages/coach/dashboard/ClientsPanel';
import { EngagementPanel } from '@/pages/coach/dashboard/EngagementPanel';
import { ContentPanel } from '@/pages/coach/dashboard/ContentPanel';
import { ReportsPanel } from '@/pages/coach/dashboard/ReportsPanel';
import { firstName, greetingKey } from '@/pages/coach/dashboard/parts';

/** Premium coach home: greeting hero + quick stats, then tabbed dashboard. */
export function CoachDashboard() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);
  const account = useSession((s) => s.account);

  const q = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId,
    staleTime: 300_000,
  });
  const planQ = useQuery({ queryKey: ['coachPlan', coachId], queryFn: () => getCoachPlan(coachId!), enabled: !!coachId, staleTime: 300_000 });
  useEffect(() => {
    if (coachId && planQ.data) void checkTrialExpiry(coachId, planQ.data);
  }, [coachId, planQ.data]);

  const d = q.data;
  const tabs: TabDef[] = [
    { key: 'overview', label: t('coachDash.tabs.overview'), icon: 'home' },
    { key: 'analytics', label: t('coachDash.tabs.analytics'), icon: 'chart' },
    { key: 'clients', label: t('coachDash.tabs.clients'), icon: 'user' },
    { key: 'engagement', label: t('coachDash.tabs.engagement'), icon: 'target' },
    { key: 'content', label: t('coachDash.tabs.content'), icon: 'dumbbell' },
    { key: 'reports', label: t('coachDash.tabs.reports'), icon: 'list' },
  ];
  const [tabParam, setTab] = useTabParam('tab', 'overview');
  const active = tabs.some((x) => x.key === tabParam) ? tabParam : 'overview';

  const name = firstName(account?.displayName || account?.email || '');
  const greeting = `${t(greetingKey(new Date().getHours()))}, ${name}`;

  return (
    <div data-testid="coach-dashboard">
      <PageHeader
        testId="coach-dashboard-top"
        eyebrow={t('platform.coachPortal')}
        title={greeting}
        actions={
          <button type="button" className="btn-primary !px-4" onClick={() => navigate('/coach/clients?new=1')}>
            <Icon name="plus" size={16} /> <span className="hidden sm:inline">{t('coachDash.addClient')}</span>
          </button>
        }
        stats={
          d ? (
            <>
              <HeroStat icon="user" value={d.activeClients} label={t('coachDash.activeClients')} />
              <HeroStat icon="calendar" value={d.expiring7} label={t('coachDash.renewals')} />
              <HeroStat icon="bolt" value={`${d.revenueThisMonth} ${d.currency}`} label={t('coachDash.revenueThisMonth')} />
            </>
          ) : null
        }
      />

      <CoachTrialBanner plan={planQ.data} usedClients={d ? d.clients.filter((c) => c.client.accountStatus !== 'disabled').length : undefined} />

      <Tabs tabs={tabs} active={active} onChange={setTab} testIdPrefix="coach-dash" className="mt-4" />

      <div className="mt-6">
        {!d ? (
          <LoadingState variant="cards" count={6} />
        ) : active === 'overview' ? (
          <OverviewPanel d={d} />
        ) : active === 'analytics' ? (
          <AnalyticsPanel d={d} />
        ) : active === 'clients' ? (
          <ClientsPanel d={d} />
        ) : active === 'engagement' ? (
          <EngagementPanel d={d} />
        ) : active === 'content' ? (
          <ContentPanel d={d} />
        ) : (
          <ReportsPanel d={d} />
        )}
      </div>
    </div>
  );
}

function HeroStat({ icon, value, label }: { icon: 'user' | 'calendar' | 'bolt'; value: string | number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-card px-3.5 py-1.5">
      <Icon name={icon} size={15} className="text-brand" />
      <span className="font-mono text-sm font-medium text-earth">{value}</span>
      <span className="text-[12px] text-earth-muted">{label}</span>
    </span>
  );
}
