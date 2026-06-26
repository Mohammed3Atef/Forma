import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { fetchCoachAdmin } from '@/services/platform/adminCoachesApi';
import { tierLabel } from '@/services/platform/coachPlanTiersApi';

export function RevenuePanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, staleTime: 120_000 });
  const d = q.data;
  if (q.isLoading || !d) return <LoadingState variant="cards" count={4} />;

  // Active paid coaches per tier (from the already-fetched rows + editable tiers) — surface only.
  const byTier = d.tiers
    .filter((tr) => tr.key !== 'trial')
    .map((tier) => {
      const coaches = d.rows.filter((r) => r.state === 'active' && r.plan?.plan === tier.key).length;
      return { key: tier.key, label: tierLabel(d.tiers, tier.key, t), coaches, price: tier.priceMonthly, total: coaches * tier.priceMonthly };
    });
  const activePaid = byTier.reduce((n, x) => n + x.coaches, 0);
  const topCoaches = [...d.rows]
    .filter((r) => r.clientCount > 0)
    .sort((a, b) => b.clientCount - a.clientCount)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="bolt" value={d.trackedRevenue} label={t('admin.trackedRevenue')} hint={t('admin.perMonth')} tone="system" />
        <MetricCard icon="target" value={`${d.conversionRate}%`} label={t('adminCoaches.conversion')} tone="brand" />
        <MetricCard icon="trophy" value={activePaid} label={t('admin.activePaidCoaches')} />
        <MetricCard icon="dumbbell" value={d.totalClients} label={t('adminCoaches.totalClients')} />
      </div>

      <p className="text-[12px] text-earth-subtle">{t('admin.pricingNote')}</p>

      <DashboardSection title={t('admin.revenueByTier')} icon="chart">
        <div className="card divide-y divide-line-soft">
          {byTier.map((x) => (
            <div key={x.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="font-medium">{x.label}</span>
              <span className="flex items-center gap-4">
                <span className="font-mono text-[12px] text-earth-subtle">{x.coaches} × {x.price}</span>
                <span className="font-mono text-sm text-earth">{x.total}{t('admin.perMonth')}</span>
              </span>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection title={t('admin.revenueByCoach')} icon="trophy" action={<button type="button" className="sec-link" onClick={() => navigate('/admin/coaches')}>{t('admin.coaches')}</button>}>
        <div className="card divide-y divide-line-soft">
          {topCoaches.length ? (
            topCoaches.map((r) => (
              <button key={r.coach.id} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="row w-full text-start">
                <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} />
                <span className="min-w-0 flex-1 truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                <span className="font-mono text-sm text-earth-muted">{r.clientCount} {t('admin.clients').toLowerCase()}</span>
              </button>
            ))
          ) : (
            <p className="py-2 text-sm text-earth-muted">{t('adminCoaches.none')}</p>
          )}
        </div>
      </DashboardSection>
    </div>
  );
}
