import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useFullBleed } from '@/hooks/useFullBleed';
import { fetchCoachAdmin, type CoachAdminRow } from '@/services/platform/adminCoachesApi';
import { listPendingPlanChangeRequests, trialDaysLeft } from '@/services/platform/coachPlanApi';
import { tierLabel } from '@/services/platform/coachPlanTiersApi';

/**
 * Platform subscriptions/MRR — matches the design's `subs()` real-data parts:
 * a featured MRR hero, a KPI row, a real "needs action" list (pending plan
 * requests + expiring trials — both already-real queries), tier-mix, plan-
 * usage bars, and top coaches by client count. Consolidates what used to be
 * 3 overlapping dashboard tabs (Revenue/Subscriptions/Growth's MRR content)
 * all re-deriving the same `coachAdmin` payload into one real destination.
 * The design's failed-charges/refund-requests/retention-cohort sections are
 * NOT built — there is no payment gateway or cohort-retention tracking behind
 * any of them in this app (subscriptions renew manually).
 */
export function AdminSubscriptions() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, staleTime: 120_000 });
  const reqs = useQuery({ queryKey: ['planRequests', 'pending'], queryFn: listPendingPlanChangeRequests, staleTime: 60_000 });
  const d = q.data;

  const nameOf = (cid: string) => {
    const row = d?.rows.find((r) => r.coach.id === cid);
    return row ? row.coach.displayName || row.coach.email : cid;
  };

  const byTier = useMemo(() => {
    if (!d) return [];
    return d.tiers
      .filter((tr) => tr.key !== 'trial')
      .map((tier) => {
        const coaches = d.rows.filter((r) => r.state === 'active' && r.plan?.plan === tier.key).length;
        return { key: tier.key, label: tierLabel(d.tiers, tier.key, t), coaches, price: tier.priceMonthly, total: coaches * tier.priceMonthly };
      })
      .filter((x) => x.coaches > 0 || x.total > 0);
  }, [d, t]);
  const maxTierTotal = Math.max(1, ...byTier.map((x) => x.total));

  const expiringTrials = useMemo(() => {
    if (!d) return [];
    return d.rows
      .filter((r) => r.state === 'trial' && r.plan)
      .map((r) => ({ r, days: trialDaysLeft(r.plan!) ?? 999 }))
      .filter((x) => x.days <= 7)
      .sort((a, b) => a.days - b.days);
  }, [d]);

  const usagePct = (r: CoachAdminRow) => (!r.plan?.maxClients ? 0 : Math.min(100, Math.round((r.clientCount / r.plan.maxClients) * 100)));
  const usageRows = useMemo(() => [...(d?.rows ?? [])].filter((r) => r.plan).sort((a, b) => usagePct(b) - usagePct(a)).slice(0, 8), [d]);
  const topCoaches = useMemo(() => [...(d?.rows ?? [])].filter((r) => r.clientCount > 0).sort((a, b) => b.clientCount - a.clientCount).slice(0, 6), [d]);

  const pending = reqs.data ?? [];
  const needsAction = pending.length + expiringTrials.filter((x) => x.days <= 3).length;

  return (
    <div data-testid="admin-subscriptions">
      <TopBar title={t('nav.adminSubscriptions')} eyebrow={t('nav.groupMonetise')} />
      {q.isLoading || !d ? (
        <LoadingState variant="cards" count={4} />
      ) : (
        <div className="space-y-6">
          <div className="card-featured">
            <p className="eyebrow mb-2">{t('admin.trackedRevenue')}</p>
            <p className="font-display text-[34px] font-bold leading-none">{d.trackedRevenue}<span className="ms-1 text-base font-normal text-earth-muted">{t('admin.perMonth')}</span></p>
            <p className="mt-2 text-sm text-earth-muted">{t('admin.pricingNote')}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard icon="timer" value={d.trialCoaches} label={t('adminCoaches.trial')} tone="brand" />
              <MetricCard icon="check" value={d.activeCoaches} label={t('adminCoaches.active')} tone="success" />
              <MetricCard icon="info" value={d.expiredCoaches} label={t('adminCoaches.expired')} tone={d.expiredCoaches ? 'danger' : 'default'} />
              <MetricCard icon="pause" value={d.suspendedCoaches} label={t('platform.status.suspended')} tone={d.suspendedCoaches ? 'danger' : 'default'} />
            </div>
          </div>

          <DashboardSection title={t('admin.needsAction', { n: needsAction })} icon="bolt">
            {pending.length === 0 && expiringTrials.length === 0 ? (
              <EmptyState icon="check" tone="brand" title={t('admin.noRequests')} />
            ) : (
              <div className="card divide-y divide-line-soft p-0">
                {pending.map((r) => (
                  <button key={`req-${r.coachId}`} type="button" onClick={() => navigate(`/admin/coaches/${r.coachId}`)} className="rowline w-full text-start">
                    <span className="tk-ic"><Icon name="bolt" size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nameOf(r.coachId)}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">
                        {r.requestedTier ? t(`adminCoaches.tier.${r.requestedTier}`) : t('admin.planRequests')}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </span>
                    </span>
                    <span className="btn-tonal btn-sm shrink-0">{t('admin.review')}</span>
                  </button>
                ))}
                {expiringTrials.map(({ r, days }) => (
                  <button key={`trial-${r.coach.id}`} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="rowline w-full text-start">
                    <span className="tk-ic"><Icon name="calendar" size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                      <span className="block truncate text-[12px] text-earth-subtle">{t('adminGrowth.coachTrial')}</span>
                    </span>
                    <span className={`shrink-0 font-mono text-[12px] ${days <= 1 ? 'text-danger' : days <= 3 ? 'text-warn' : 'text-earth-muted'}`}>{t('subscription.daysLeft', { n: Math.max(0, days) })}</span>
                  </button>
                ))}
              </div>
            )}
          </DashboardSection>

          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardSection title={t('admin.revenueByTier')} icon="chart">
              {byTier.length === 0 ? (
                <EmptyState icon="chart" title={t('adminPlans.none')} />
              ) : (
                <div className="card space-y-3.5">
                  {byTier.map((x) => (
                    <div key={x.key}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{x.label}</span>
                        <span className="font-mono text-[12px] text-earth">{x.coaches} × {x.price} = {x.total}</span>
                      </div>
                      <div className="prog thin"><span style={{ width: `${(x.total / maxTierTotal) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardSection>

            <DashboardSection title={t('admin.planUsage')} icon="activity">
              <div className="card space-y-3.5">
                {usageRows.map((r) => (
                  <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="block w-full text-start">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.coach.displayName || r.coach.email}</span>
                      <span className="shrink-0 font-mono text-[12px] text-earth-muted">{r.clientCount}/{r.plan?.maxClients}</span>
                    </div>
                    <div className="prog"><span style={{ width: `${usagePct(r)}%` }} /></div>
                  </button>
                ))}
              </div>
            </DashboardSection>
          </div>

          <DashboardSection title={t('admin.revenueByCoach')} icon="trophy" action={<button type="button" className="sec-link" onClick={() => navigate('/admin/coaches')}>{t('admin.coaches')}</button>}>
            <div className="card divide-y divide-line-soft p-0">
              {topCoaches.length ? (
                topCoaches.map((r) => (
                  <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="rowline w-full text-start">
                    <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                    <span className="shrink-0 font-mono text-sm text-earth-muted">{r.clientCount} {t('admin.clients').toLowerCase()}</span>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-earth-muted">{t('adminCoaches.none')}</p>
              )}
            </div>
          </DashboardSection>
        </div>
      )}
    </div>
  );
}
