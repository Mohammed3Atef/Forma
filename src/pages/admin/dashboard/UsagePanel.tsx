import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { BarChart } from '@/components/charts';
import { fetchUsage } from '@/services/platform/usageApi';

/** Admin usage/traffic panel: in-app active users + searches, plus site-traffic note. */
export function UsagePanel() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['adminUsage'], queryFn: fetchUsage, staleTime: 120_000 });
  const d = q.data;
  if (q.isLoading || !d) return <LoadingState variant="cards" count={4} />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="user" value={d.dau} label={t('adminUsage.dau')} tone="brand" />
        <MetricCard icon="activity" value={d.wau} label={t('adminUsage.wau')} />
        <MetricCard icon="calendar" value={d.mau} label={t('adminUsage.mau')} />
        <MetricCard icon="search" value={d.searches7d} label={t('adminUsage.searches7d')} />
      </div>
      <DashboardSection title={t('adminUsage.activeTrend')} icon="chart">
        <div className="card"><BarChart data={d.activeTrend} /></div>
      </DashboardSection>
      <DashboardSection title={t('adminUsage.siteTraffic')} icon="info">
        <div className="card"><p className="text-sm text-earth-muted">{t('adminUsage.siteTrafficNote')}</p></div>
      </DashboardSection>
    </div>
  );
}
