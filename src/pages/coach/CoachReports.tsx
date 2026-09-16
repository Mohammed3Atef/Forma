import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useSession } from '@/services/auth/sessionStore';
import { getCoachDashboard } from '@/services/platform/coachDashboardApi';
import { ReportsPanel } from '@/pages/coach/dashboard/ReportsPanel';

/**
 * Reports as its own destination — matches the design's `reports()`, which
 * treats Business/Reports as a top-level nav item, not a dashboard tab.
 * Reuses `ReportsPanel` (KPI row, real CSV exports, adherence ranking) — same
 * `coachDashboard` query key as the Dashboard, so this is a cache hit, not a
 * second network round-trip, when both have been visited.
 */
export function CoachReports() {
  useFullBleed();
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id);

  const q = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId,
    staleTime: 60_000,
  });
  const d = q.data;

  return (
    <div className="anim-rise" data-testid="coach-reports">
      <TopBar title={t('coachDash.reportsTitle')} eyebrow={t('nav.groupBusiness')} />
      {q.isLoading || !d ? <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p> : <ReportsPanel d={d} />}
    </div>
  );
}
