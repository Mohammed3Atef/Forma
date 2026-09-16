import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { BarChart, DonutChart } from '@/components/charts';
import { useFullBleed } from '@/hooks/useFullBleed';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';
import { fetchUsage } from '@/services/platform/usageApi';
import { colors } from '@/theme/colors';

/**
 * Matches the design's `analytics()` real-data parts: the "DAU/MAU"-style
 * usage stats (migrated from the now-removed dashboard "Usage" tab — same
 * real, server-computed `fetchUsage`) and a role-distribution donut (same
 * real account-role counts already shown, just an added real visualization
 * alongside the existing bar chart). The design's onboarding funnel and
 * hourly-usage bars are NOT built — both need platform-wide signup→session
 * and session-timestamp aggregation that doesn't exist yet; real backend
 * work, not something to fake with placeholder numbers.
 */
export function AdminAnalytics() {
  useFullBleed();
  const { t } = useTranslation();
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats });
  const usage = useQuery({ queryKey: ['adminUsage'], queryFn: fetchUsage, staleTime: 120_000 });
  const d = stats.data;
  const u = usage.data;

  const dist = d
    ? [
        { label: t('roles.client'), value: d.byRole.client, color: colors.brandOrange },
        { label: t('roles.coach'), value: d.byRole.coach, color: colors.violet },
        { label: t('roles.admin'), value: d.byRole.admin + d.byRole.super_admin, color: colors.info },
      ]
    : [];
  const barDist = d
    ? [
        { label: t('roles.admin'), value: d.byRole.admin + d.byRole.super_admin },
        { label: t('roles.coach'), value: d.byRole.coach },
        { label: t('roles.client'), value: d.byRole.client },
      ]
    : [];

  return (
    <>
      <TopBar testId="admin-analytics" title={t('admin.analytics')} eyebrow={t('nav.groupMonitor')} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="user" value={u?.dau ?? '—'} label={t('adminUsage.dau')} />
        <StatTile icon="activity" value={u?.wau ?? '—'} label={t('adminUsage.wau')} />
        <StatTile icon="calendar" value={u?.mau ?? '—'} label={t('adminUsage.mau')} />
        <StatTile icon="search" value={u?.searches7d ?? '—'} label={t('adminUsage.searches7d')} />
      </div>

      {u?.activeTrend?.length ? (
        <>
          <h2 className="h2 mb-1 mt-6">{t('adminUsage.activeTrend')}</h2>
          <div className="card"><BarChart data={u.activeTrend} /></div>
        </>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="h2 mb-2">{t('admin.roleDistribution')}</h2>
          <div className="card flex items-center justify-center py-6">
            {dist.length ? <DonutChart data={dist} centerLabel={t('admin.totalAccounts')} /> : <p className="text-sm text-earth-muted">{t('progress.noData')}</p>}
          </div>
        </div>
        <div>
          <h2 className="h2 mb-2">{t('admin.totalAccounts')}</h2>
          <div className="card">
            {barDist.length ? <BarChart data={barDist} /> : <p className="py-6 text-center text-sm text-earth-muted">{t('progress.noData')}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
