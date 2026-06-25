import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { trialDaysLeft, listPendingPlanChangeRequests } from '@/services/platform/coachPlanApi';

export function SubscriptionsPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, staleTime: 120_000 });
  const reqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, staleTime: 60_000 });
  const d = q.data;
  if (q.isLoading || !d) return <LoadingState variant="cards" count={4} />;

  const nameOf = (cid: string) => {
    const row = d.rows.find((r) => r.coach.id === cid);
    return row ? row.coach.displayName || row.coach.email : cid;
  };
  const pending = reqs.data ?? [];

  const expiring = d.rows
    .filter((r) => r.state === 'trial' && r.plan)
    .map((r) => ({ r, days: trialDaysLeft(r.plan!) ?? 999 }))
    .filter((x) => x.days <= 7)
    .sort((a, b) => a.days - b.days);

  const usagePct = (r: CoachAdminRow) => {
    if (!r.plan || !r.plan.maxClients) return 0;
    return Math.min(100, Math.round((r.clientCount / r.plan.maxClients) * 100));
  };
  const usageRows = [...d.rows]
    .filter((r) => r.plan)
    .sort((a, b) => usagePct(b) - usagePct(a))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="timer" value={d.trialCoaches} label={t('adminCoaches.trial')} tone="brand" />
        <MetricCard icon="check" value={d.activeCoaches} label={t('adminCoaches.active')} tone="success" />
        <MetricCard icon="info" value={d.expiredCoaches} label={t('adminCoaches.expired')} tone={d.expiredCoaches ? 'danger' : 'default'} />
        <MetricCard icon="pause" value={d.suspendedCoaches} label={t('platform.status.suspended')} tone={d.suspendedCoaches ? 'danger' : 'default'} />
      </div>

      <DashboardSection title={t('admin.planRequests')} icon="bolt">
        {pending.length ? (
          <div className="card divide-y divide-line-soft p-0" data-testid="admin-plan-requests">
            {pending.map((r) => (
              <button key={r.coachId} type="button" onClick={() => navigate(`/admin/coaches/${r.coachId}`)} className="row w-full px-5 text-start">
                <span className="row-av"><Icon name="bolt" size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{nameOf(r.coachId)}</span>
                  <span className="block truncate text-[12px] text-earth-subtle">
                    {r.requestedTier ? t(`adminCoaches.tier.${r.requestedTier}`) : t('admin.planRequests')}
                    {r.reason ? ` · ${r.reason}` : ''}
                  </span>
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="check" tone="brand" title={t('admin.noRequests')} />
        )}
      </DashboardSection>

      <DashboardSection title={t('admin.expiringTrials')} icon="calendar">
        {expiring.length ? (
          <div className="card divide-y divide-line-soft">
            {expiring.map(({ r, days }) => (
              <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="row w-full text-start">
                <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                <span className={`font-mono text-sm ${days <= 1 ? 'text-danger' : 'text-warn'}`}>
                  {t('adminCoaches.trialDaysLeft')}: {Math.max(0, days)}
                </span>
                <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="check" tone="brand" title={t('admin.noExpiring')} />
        )}
      </DashboardSection>

      <DashboardSection title={t('admin.planUsage')} icon="chart">
        <div className="card space-y-3.5">
          {usageRows.map((r) => (
            <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="block w-full text-start">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.coach.displayName || r.coach.email}</span>
                <span className="shrink-0 font-mono text-[12px] text-earth-muted">{r.clientCount}/{r.plan?.maxClients}</span>
              </div>
              <div className="prog">
                <span style={{ width: `${usagePct(r)}%` }} />
              </div>
            </button>
          ))}
        </div>
      </DashboardSection>
    </div>
  );
}
