import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarChart } from '@/components/charts';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { fetchGrowth } from '@/services/platform/adminGrowthApi';
import { fetchCoachAdmin } from '@/services/platform/adminCoachesApi';
import { trialDaysLeft } from '@/services/platform/coachPlanApi';

export function GrowthPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const g = useQuery({ queryKey: ['adminGrowth'], queryFn: fetchGrowth, staleTime: 120_000 });
  const c = useQuery({ queryKey: ['coachAdmin'], queryFn: fetchCoachAdmin, staleTime: 120_000 });
  const d = g.data;
  if (g.isLoading || !d) return <LoadingState variant="cards" count={4} />;

  const weekDelta = d.newThisWeek - d.newPrevWeek;
  const deltaDir = weekDelta > 0 ? 'up' : weekDelta < 0 ? 'down' : 'flat';
  const coachMrr = c.data?.trackedRevenue ?? 0;
  const totalMrr = coachMrr + d.clientMrr;

  const expiringTrials = (c.data?.rows ?? [])
    .filter((r) => r.state === 'trial' && r.plan)
    .map((r) => ({ r, days: trialDaysLeft(r.plan!) ?? 999 }))
    .filter((x) => x.days <= 7)
    .sort((a, b) => a.days - b.days);

  const urgent = d.expiringClients.filter((x) => x.days <= 3).length + expiringTrials.filter((x) => x.days <= 3).length;
  const money = (n: number) => `${n} ${d.currency}`;

  return (
    <div className="space-y-6">
      {urgent > 0 ? (
        <div data-testid="admin-expiry-alert" className="card flex items-center gap-3 border-warn/40 bg-warn/5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-warn/30 bg-warn/10 text-warn">
            <Icon name="calendar" size={18} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">{t('adminGrowth.urgentAlert', { n: urgent })}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="user" value={d.totalMembers} label={t('adminMembers.members')} delta={{ value: `${weekDelta >= 0 ? '+' : ''}${weekDelta}`, dir: deltaDir }} hint={t('adminGrowth.vsPrevWeek')} />
        <MetricCard icon="plus" value={d.newThisMonth} label={t('adminMembers.newThisMonth')} tone="brand" />
        <MetricCard icon="bolt" value={money(totalMrr)} label={t('adminGrowth.monthlyRevenue')} hint={t('admin.perMonth')} tone="system" />
        <MetricCard icon="calendar" value={d.expiringClients.length + expiringTrials.length} label={t('adminGrowth.endingSoon')} tone={urgent ? 'danger' : d.expiringClients.length + expiringTrials.length ? 'warn' : 'default'} />
      </div>

      <DashboardSection title={t('adminGrowth.newSignups')} icon="chart">
        <div className="card">
          <BarChart data={d.signupSeries} />
        </div>
      </DashboardSection>

      <DashboardSection title={t('adminGrowth.money')} icon="bolt">
        <div className="card divide-y divide-line-soft">
          <div className="flex items-center justify-between py-3 first:pt-0"><span className="font-medium">{t('adminGrowth.coachMrr')}</span><span className="font-mono text-sm">{money(coachMrr)}</span></div>
          <div className="flex items-center justify-between py-3"><span className="font-medium">{t('adminGrowth.clientMrr')}</span><span className="font-mono text-sm">{money(d.clientMrr)}</span></div>
          <div className="flex items-center justify-between py-3 last:pb-0"><span className="font-semibold">{t('adminGrowth.totalMrr')}</span><span className="font-mono text-sm font-semibold text-brand">{money(totalMrr)}</span></div>
        </div>
        <p className="mt-2 text-[12px] text-earth-subtle">{t('admin.pricingNote')}</p>
      </DashboardSection>

      <DashboardSection title={t('adminGrowth.endingSoonTitle')} icon="calendar">
        {d.expiringClients.length + expiringTrials.length === 0 ? (
          <EmptyState icon="check" tone="brand" title={t('admin.noExpiring')} />
        ) : (
          <div className="card divide-y divide-line-soft">
            {expiringTrials.map(({ r, days }) => (
              <button key={`t-${r.coach.id}`} type="button" onClick={() => navigate(`/admin/coaches/${r.coach.id}`)} className="row w-full text-start">
                <Avatar name={r.coach.displayName || r.coach.email} photoUrl={r.coach.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.coach.displayName || r.coach.email}</span>
                  <span className="block truncate text-[12px] text-earth-subtle">{t('adminGrowth.coachTrial')}</span>
                </span>
                <span className={`shrink-0 font-mono text-sm ${days <= 1 ? 'text-danger' : days <= 3 ? 'text-warn' : 'text-earth-muted'}`}>{t('subscription.daysLeft', { n: Math.max(0, days) })}</span>
                <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
              </button>
            ))}
            {d.expiringClients.map((x) => (
              <button key={`c-${x.clientId}`} type="button" onClick={() => navigate(`/admin/clients/${x.clientId}`)} className="row w-full text-start">
                <Avatar name={x.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{x.name}</span>
                  <span className="block truncate text-[12px] text-earth-subtle">{t('adminGrowth.clientSub')}</span>
                </span>
                <span className={`shrink-0 font-mono text-sm ${x.days <= 1 ? 'text-danger' : x.days <= 3 ? 'text-warn' : 'text-earth-muted'}`}>{t('subscription.daysLeft', { n: x.days })}</span>
                <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
              </button>
            ))}
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
