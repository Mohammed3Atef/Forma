import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { StatTile } from '@/components/StatTile';
import { BarChart, DonutChart } from '@/components/charts';
import { useFullBleed } from '@/hooks/useFullBleed';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';
import { fetchUsage } from '@/services/platform/usageApi';
import { fetchGrowth } from '@/services/platform/adminGrowthApi';
import { colors } from '@/theme/colors';

/**
 * Matches the design's `analytics()` real-data parts: the "DAU/MAU"-style
 * usage stats (migrated from the now-removed dashboard "Usage" tab — same
 * real, server-computed `fetchUsage`) and a role-distribution donut (same
 * real account-role counts already shown). The design's onboarding funnel
 * and hourly-usage bars are NOT built — both need platform-wide
 * signup→session and session-timestamp aggregation that doesn't exist yet;
 * real backend work, not something to fake with placeholder numbers.
 *
 * CHARTS PASS: removed a second bar chart that plotted the exact same 3
 * role counts as the donut below it (same numbers, no differentiating
 * insight — a duplicate, not a second visualization). In its place: a real
 * chart using data the backend already computes but the frontend never
 * rendered — `fetchGrowth()`'s `subBreakdown` (platform-wide client
 * subscription-status mix), which directly serves this page's "platform
 * operations" purpose and was otherwise dead on the wire.
 */
export function AdminAnalytics() {
  useFullBleed();
  const { t, i18n } = useTranslation();
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats });
  const usage = useQuery({ queryKey: ['adminUsage'], queryFn: fetchUsage, staleTime: 120_000 });
  const growth = useQuery({ queryKey: ['adminGrowth'], queryFn: fetchGrowth, staleTime: 120_000 });
  const d = stats.data;
  const u = usage.data;
  const g = growth.data;

  const dist = d
    ? [
        { label: t('roles.client'), value: d.byRole.client, color: colors.brandOrange },
        { label: t('roles.coach'), value: d.byRole.coach, color: colors.violet },
        { label: t('roles.admin'), value: d.byRole.admin + d.byRole.super_admin, color: colors.info },
      ]
    : [];

  const SUB_COLORS: Record<string, string> = {
    trial: colors.info,
    active: colors.success,
    pending: colors.warning,
    expired: colors.danger,
    frozen: colors.violet,
    cancelled: colors.textMuted,
    ended: colors.textMuted,
    none: colors.textMuted,
  };
  const subDist = g
    ? (Object.entries(g.subBreakdown) as [string, number][]).map(([status, value]) => ({
        label: t(`subscription.status.${status}`),
        value,
        color: SUB_COLORS[status] ?? colors.textMuted,
      }))
    : [];

  // WAU/MAU "stickiness" ratio — a real derived insight from the same two
  // numbers already on screen, not a new metric.
  const wauMauPct = u && u.mau > 0 ? Math.round((u.wau / u.mau) * 100) : null;

  return (
    <>
      <TopBar testId="admin-analytics" title={t('admin.analytics')} eyebrow={t('nav.groupMonitor')} />

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile icon="user" value={u?.dau ?? '—'} label={t('adminUsage.dau')} />
        <StatTile icon="activity" value={u?.wau ?? '—'} label={t('adminUsage.wau')} />
        <StatTile icon="calendar" value={u?.mau ?? '—'} label={t('adminUsage.mau')} />
        <StatTile icon="search" value={u?.searches7d ?? '—'} label={t('adminUsage.searches7d')} />
      </div>
      {wauMauPct != null && <p className="mt-2 text-sm text-earth-muted">{t('adminUsage.wauMauRatio', { pct: wauMauPct })}</p>}

      {u?.activeTrend?.length ? (
        <>
          <h2 className="h2 mb-1 mt-6">{t('adminUsage.activeTrend')}</h2>
          <div className="card"><BarChart data={u.activeTrend} locale={i18n.language} emptyLabel={t('progress.noData')} /></div>
        </>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="h2 mb-2">{t('admin.roleDistribution')}</h2>
          <div className="card flex items-center justify-center py-6">
            {stats.isLoading ? (
              <p className="text-sm text-earth-muted">{t('common.loading')}</p>
            ) : stats.isError ? (
              <p className="text-sm text-danger">{t('common.errorGeneric')}</p>
            ) : dist.length ? (
              <DonutChart data={dist} centerLabel={t('admin.totalAccounts')} emptyLabel={t('progress.noData')} />
            ) : (
              <p className="text-sm text-earth-muted">{t('progress.noData')}</p>
            )}
          </div>
        </div>
        <div>
          <h2 className="h2 mb-2">{t('admin.clientSubMix')}</h2>
          <div className="card flex items-center justify-center py-6">
            {growth.isLoading ? (
              <p className="text-sm text-earth-muted">{t('common.loading')}</p>
            ) : growth.isError ? (
              <p className="text-sm text-danger">{t('common.errorGeneric')}</p>
            ) : subDist.length ? (
              <DonutChart data={subDist} centerLabel={t('admin.clientSubs')} emptyLabel={t('progress.noData')} />
            ) : (
              <p className="text-sm text-earth-muted">{t('progress.noData')}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
