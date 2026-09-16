import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart } from '@/components/charts';
import { useSession } from '@/services/auth/sessionStore';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';
import { fetchCoachAdmin } from '@/services/platform/adminCoachesApi';
import { fetchGrowth } from '@/services/platform/adminGrowthApi';
import { listPendingPlanChangeRequests } from '@/services/platform/coachPlanApi';
import { listPendingTransferRequests } from '@/services/platform/transferApi';
import { fetchAuditPage } from '@/services/platform/auditApi';
import { CoachStateBadge } from './CoachStateBadge';

export function OverviewPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats, staleTime: 120_000 });
  const recent = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => fetchAuditPage(6), staleTime: 60_000 });
  const coaches = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, enabled: isSuper, staleTime: 120_000 });
  const growth = useQuery({ queryKey: ['adminGrowth'], queryFn: fetchGrowth, enabled: isSuper, staleTime: 120_000 });
  const planReqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, enabled: isSuper, staleTime: 60_000 });
  const transferReqs = useQuery({ queryKey: ['pendingTransfers', 'count'], queryFn: listPendingTransferRequests, staleTime: 60_000 });
  const s = stats.data;

  // Real, per-item-actionable review queue: pending coach plan-change
  // requests, pending client transfer requests, and coaches over their client
  // cap — three things that already have working review flows elsewhere.
  const overCapacity = useMemo(() => (coaches.data?.rows ?? []).filter((r) => r.plan && r.clientCount > r.plan.maxClients), [coaches.data]);
  const needsReview = [
    ...(planReqs.data ?? []).map((r) => ({ kind: 'plan' as const, id: r.coachId, requestedAt: r.requestedAt })),
    ...(transferReqs.data ?? []).map((r) => ({ kind: 'transfer' as const, id: r.clientId, requestedAt: r.requestedAt })),
    ...overCapacity.map((r) => ({ kind: 'capacity' as const, id: r.coach.id, requestedAt: 0 })),
  ].sort((a, b) => b.requestedAt - a.requestedAt);
  const reviewCount = needsReview.length;

  const nameOfCoach = (id: string) => coaches.data?.rows.find((r) => r.coach.id === id)?.coach.displayName || id;

  return (
    <div data-testid="admin-overview" className="space-y-6">
      {/* Headline — real review-needed counts, not a generic title */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-[28px]">
          {reviewCount > 0 ? t('admin.itemsNeedReview', { n: reviewCount }) : t('admin.platformHealthy')}
        </h2>
      </div>

      {stats.isLoading ? (
        <LoadingState variant="cards" count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon="user" value={s?.total ?? '—'} label={t('admin.totalAccounts')} onClick={() => navigate('/admin/accounts')} />
          <MetricCard icon="trophy" value={s?.byRole.coach ?? '—'} label={t('admin.coaches')} tone="brand" />
          <MetricCard icon="dumbbell" value={s?.byRole.client ?? '—'} label={t('admin.clients')} />
          <MetricCard icon="settings" value={s?.byRole.admin ?? '—'} label={t('admin.admins')} />
          <MetricCard icon="timer" value={s?.pending ?? '—'} label={t('platform.status.pending')} tone={s?.pending ? 'warn' : 'default'} />
          <MetricCard icon="info" value={s?.suspended ?? '—'} label={t('platform.status.suspended')} tone={s?.suspended ? 'danger' : 'default'} />
        </div>
      )}

      {isSuper && coaches.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon="bolt" value={coaches.data.trackedRevenue} label={t('admin.trackedRevenue')} hint={t('admin.perMonth')} tone="brand" />
          <MetricCard icon="trophy" value={coaches.data.activeCoaches} label={t('adminCoaches.active')} />
          <MetricCard icon="timer" value={coaches.data.trialCoaches} label={t('adminCoaches.trial')} />
          <MetricCard icon="target" value={`${coaches.data.conversionRate}%`} label={t('adminCoaches.conversion')} tone="brand" />
        </div>
      ) : null}

      <DashboardSection title={t('admin.needsReview', { n: reviewCount })} icon="info">
        {reviewCount === 0 ? (
          <EmptyState icon="check" tone="brand" title={t('admin.nothingToReview')} />
        ) : (
          <div className="card divide-y divide-line-soft p-0">
            {needsReview.slice(0, 6).map((item) => {
              if (item.kind === 'plan') {
                return (
                  <div key={`plan-${item.id}`} className="rowline">
                    <span className="tk-ic"><Icon name="bolt" size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nameOfCoach(item.id)}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">{t('admin.planRequests')}</span>
                    </span>
                    <button type="button" className="btn-tonal btn-sm shrink-0" onClick={() => navigate(`/admin/coaches/${item.id}`)}>{t('admin.review')}</button>
                  </div>
                );
              }
              if (item.kind === 'capacity') {
                return (
                  <div key={`cap-${item.id}`} className="rowline">
                    <span className="tk-ic text-danger"><Icon name="target" size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nameOfCoach(item.id)}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">{t('admin.overCapacity')}</span>
                    </span>
                    <button type="button" className="btn-tonal btn-sm shrink-0" onClick={() => navigate(`/admin/coaches/${item.id}`)}>{t('admin.review')}</button>
                  </div>
                );
              }
              return (
                <div key={`transfer-${item.id}`} className="rowline">
                  <span className="tk-ic"><Icon name="target" size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t('transferReq.pendingTitle')}</span>
                  </span>
                  <button type="button" className="btn-tonal btn-sm shrink-0" onClick={() => navigate('/admin/assignments')}>{t('admin.review')}</button>
                </div>
              );
            })}
          </div>
        )}
      </DashboardSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection title={t('admin.recentActivity')} icon="list" action={<button type="button" className="sec-link" onClick={() => navigate('/admin/audit')}>{t('admin.auditLogs')}</button>}>
          {recent.isLoading ? (
            <LoadingState count={3} />
          ) : recent.data?.logs.length ? (
            <div className="card divide-y divide-line-soft">
              {recent.data.logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="truncate text-sm">{t(log.action, { defaultValue: log.action.replace(/\./g, ' ') })}</span>
                  <span className="shrink-0 font-mono text-[11px] text-earth-subtle">{new Date(log.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="list" title={t('admin.noLogs')} />
          )}
        </DashboardSection>

        {isSuper && growth.data ? (
          <DashboardSection title={t('adminGrowth.newSignups')} icon="chart">
            <div className="card"><BarChart data={growth.data.signupSeries} /></div>
          </DashboardSection>
        ) : null}
      </div>

      {isSuper && coaches.data?.recent.length ? (
        <DashboardSection
          title={t('admin.recentCoaches')}
          icon="trophy"
          action={<button type="button" className="sec-link" onClick={() => navigate('/admin/coaches')}>{t('admin.coaches')}</button>}
        >
          <div className="card divide-y divide-line-soft">
            {coaches.data.recent.map((r) => (
              <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="row w-full text-start">
                <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                  <span className="block truncate text-[12px] text-earth-subtle">{r.coach.email}</span>
                </span>
                <CoachStateBadge state={r.state} />
              </button>
            ))}
          </div>
        </DashboardSection>
      ) : null}
    </div>
  );
}
