import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { useSession } from '@/services/auth/sessionStore';
import { getCoachDashboard } from '@/services/platform/coachDashboardApi';
import { AnalyticsPanel } from '@/pages/coach/dashboard/AnalyticsPanel';

/**
 * Revenue as its own destination — matches the design's `revenue()`, which
 * treats Business/Revenue as a top-level nav item, not a dashboard tab. Reuses
 * `AnalyticsPanel` (revenue KPIs, renewal timeline, subscriptions, growth) —
 * same `coachDashboard` query key as the Dashboard, so this is a cache hit,
 * not a second network round-trip, when both have been visited.
 */
export function CoachRevenue() {
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id);
  const q = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId,
    staleTime: 300_000,
  });
  const d = q.data;

  return (
    <div data-testid="coach-revenue">
      <TopBar title={t('nav.coachRevenue')} eyebrow={t('nav.groupBusiness')} />
      {!d ? (
        <LoadingState variant="cards" count={4} />
      ) : (
        <div className="mt-2">
          <div className="card-featured mb-6">
            <p className="eyebrow mb-2">{t('coachDash.thisMonth')}</p>
            <p className="font-display text-[34px] font-bold leading-none">{d.revenueThisMonth} <span className="text-base font-normal text-earth-muted">{d.currency}</span></p>
            <p className="mt-2 text-sm text-earth-muted">{t('coachDash.revenueHint')}</p>
          </div>
          <AnalyticsPanel d={d} />
        </div>
      )}
    </div>
  );
}
