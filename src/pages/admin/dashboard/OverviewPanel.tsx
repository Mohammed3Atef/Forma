import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useSession } from '@/services/auth/sessionStore';
import { fetchPlatformStats } from '@/services/platform/analyticsApi';
import { fetchCoachAdmin } from '@/services/platform/adminCoachesApi';
import { listPendingPlanChangeRequests } from '@/services/platform/coachPlanApi';
import { fetchAuditPage } from '@/services/platform/auditApi';
import { Icon } from '@/components/Icon';
import { CoachStateBadge } from './CoachStateBadge';

export function OverviewPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const stats = useQuery({ queryKey: ['platformStats'], queryFn: fetchPlatformStats, staleTime: 120_000 });
  const recent = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => fetchAuditPage(6), staleTime: 60_000 });
  const coaches = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, enabled: isSuper, staleTime: 120_000 });
  const planReqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, enabled: isSuper, staleTime: 60_000 });
  const s = stats.data;
  const pendingReqs = planReqs.data?.length ?? 0;

  return (
    <div data-testid="admin-overview" className="space-y-6">
      {isSuper && pendingReqs > 0 ? (
        <button
          type="button"
          data-testid="admin-pending-requests-alert"
          onClick={() => navigate('/admin?tab=subscriptions')}
          className="card card-hover flex w-full items-center gap-3 border-brand/40 bg-brand/5 text-start"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/30 bg-brand/10 text-brand">
            <Icon name="bolt" size={18} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">{t('admin.requestsPending', { n: pendingReqs })}</span>
          <span className="sec-link shrink-0">{t('admin.reviewRequests')}</span>
        </button>
      ) : null}
      {stats.isLoading ? (
        <LoadingState variant="cards" count={6} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard icon="user" value={s?.total ?? '—'} label={t('admin.totalAccounts')} onClick={() => navigate('/admin/accounts')} />
          <MetricCard icon="trophy" value={s?.byRole.coach ?? '—'} label={t('admin.coaches')} tone="system" />
          <MetricCard icon="dumbbell" value={s?.byRole.client ?? '—'} label={t('admin.clients')} />
          <MetricCard icon="settings" value={s?.byRole.admin ?? '—'} label={t('admin.admins')} />
          <MetricCard icon="timer" value={s?.pending ?? '—'} label={t('platform.status.pending')} tone={s?.pending ? 'warn' : 'default'} />
          <MetricCard icon="info" value={s?.suspended ?? '—'} label={t('platform.status.suspended')} tone={s?.suspended ? 'danger' : 'default'} />
        </div>
      )}

      {isSuper && coaches.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon="bolt" value={coaches.data.trackedRevenue} label={t('admin.trackedRevenue')} hint={t('admin.perMonth')} tone="system" />
          <MetricCard icon="trophy" value={coaches.data.activeCoaches} label={t('adminCoaches.active')} />
          <MetricCard icon="timer" value={coaches.data.trialCoaches} label={t('adminCoaches.trial')} />
          <MetricCard icon="target" value={`${coaches.data.conversionRate}%`} label={t('adminCoaches.conversion')} tone="brand" />
        </div>
      ) : null}

      <DashboardSection
        title={t('admin.recentActivity')}
        icon="list"
        action={<button type="button" className="sec-link" onClick={() => navigate('/admin/governance')}>{t('admin.auditLogs')}</button>}
      >
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
