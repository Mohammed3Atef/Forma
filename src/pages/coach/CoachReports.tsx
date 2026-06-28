import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useSession } from '@/services/auth/sessionStore';
import { getCoachDashboard, type ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { shortDate } from '@/lib/utils';

/**
 * Desktop analytics for the coach. Reuses the dashboard aggregate (shared React
 * Query cache) for KPIs + an adherence ranking. Deeper per-day nutrition/cardio
 * analytics and a cross-client substitutions-to-review feed are follow-ups
 * (substitutions surface per-client in the activity view today).
 */
export function CoachReports() {
  useFullBleed();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);

  const q = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId,
    staleTime: 60_000,
  });
  const d = q.data;

  const ranking = useMemo(
    () => [...(d?.clients ?? [])].sort((a, b) => b.workouts7d - a.workouts7d),
    [d?.clients],
  );
  const pg = usePagination(ranking, 25);

  const columns: Column<ClientDashboardRow>[] = [
    {
      key: 'client',
      header: t('coach.clients'),
      cell: (r) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} size="sm" />
          <span className="truncate font-medium">{r.client.displayName || r.client.email}</span>
        </span>
      ),
    },
    { key: 'w7', header: t('coach.last7Days'), cell: (r) => <span className="font-mono">{r.workouts7d}</span>, className: 'text-end' },
    { key: 'status', header: t('assessment.title'), cell: (r) => <span className="text-[12px] text-earth-subtle">{t(`assessment.status.${r.assessment}`)}</span> },
    { key: 'last', header: t('coachDash.recentActivity'), cell: (r) => <span className="text-[12px] text-earth-subtle">{r.lastActivity ? shortDate(r.lastActivity, i18n.language) : '—'}</span> },
  ];

  return (
    <div className="anim-rise" data-testid="coach-reports">
      <TopBar title={t('coachDash.reportsTitle')} eyebrow={t('platform.coachPortal')} />
      {q.isLoading || !d ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-6">
          <ResponsiveGrid cols={4}>
            <DashboardCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} tone="brand" />
            <DashboardCard icon="dumbbell" value={d.avgWorkouts7d} label={t('coachDash.avgWorkoutsLabel')} />
            <DashboardCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments ? 'warn' : 'default'} />
            <DashboardCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.missedCheckins')} tone={d.checkinsToReview ? 'warn' : 'default'} />
          </ResponsiveGrid>

          <section>
            <h2 className="h2 mb-2">{t('coachDash.ranking')}</h2>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={pg.pageItems}
                rowKey={(r) => r.client.id}
                onRowClick={(r) => navigate(`/coach/client/${r.client.id}`)}
                empty={t('coachDash.noClients')}
              />
            </div>
            {/* Mobile / tablet rows */}
            <div className="card divide-y divide-line-soft lg:hidden">
              {ranking.length === 0 ? (
                <p className="py-8 text-center text-sm text-earth-muted">{t('coachDash.noClients')}</p>
              ) : (
                pg.pageItems.map((r) => (
                  <button key={r.client.id} type="button" onClick={() => navigate(`/coach/client/${r.client.id}`)} className="row w-full text-start">
                    <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.client.displayName || r.client.email}</span>
                    <span className="font-mono text-sm">
                      <span className={r.workouts7d > 0 ? 'text-brand' : 'text-earth-subtle'}>{r.workouts7d}</span>
                      <span className="text-earth-subtle"> {t('coach.workoutsShort')}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
            <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
          </section>
        </div>
      )}
    </div>
  );
}
