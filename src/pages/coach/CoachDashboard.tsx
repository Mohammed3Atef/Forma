import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Avatar } from '@/components/Avatar';
import { Icon, type IconName } from '@/components/Icon';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { BarChart } from '@/components/charts';
import { useSession } from '@/services/auth/sessionStore';
import { getCoachDashboard, type ClientDashboardRow } from '@/services/platform/coachDashboardApi';
import { getCoachPlan } from '@/services/platform/coachPlanApi';
import { checkTrialExpiry } from '@/services/platform/coachTrialApi';
import { CoachChecklist } from '@/pages/coach/onboarding/CoachChecklist';
import { CoachTrialBanner } from '@/pages/coach/onboarding/CoachTrialBanner';
import { shortDate } from '@/lib/utils';

/** Desktop/tablet coach landing: KPIs, attention lists, adherence chart, quick actions. */
export function CoachDashboard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const coachId = useSession((s) => s.account?.id);

  const q = useQuery({
    queryKey: ['coachDashboard', coachId],
    queryFn: () => getCoachDashboard(coachId!),
    enabled: !!coachId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const d = q.data;

  const planQ = useQuery({
    queryKey: ['coachPlan', coachId],
    queryFn: () => getCoachPlan(coachId!),
    enabled: !!coachId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Trial-expiry reminders at 7/3/1 days — runs whenever the coach plan loads or
  // refetches on foreground (React Query's refetchOnWindowFocus mirrors the
  // app's existing visibility/refreshAccount pattern). Marks each send once.
  useEffect(() => {
    if (coachId && planQ.data) void checkTrialExpiry(coachId, planQ.data);
  }, [coachId, planQ.data]);

  const recent = useMemo(
    () => [...(d?.clients ?? [])].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')).slice(0, 6),
    [d?.clients],
  );
  const attention = useMemo(() => (d?.clients ?? []).filter((c) => c.needsAttention).slice(0, 6), [d?.clients]);
  const chart = useMemo(
    () =>
      [...(d?.clients ?? [])]
        .sort((a, b) => b.workouts7d - a.workouts7d)
        .slice(0, 7)
        .map((c) => ({ label: firstName(c.client.displayName || c.client.email), value: c.workouts7d })),
    [d?.clients],
  );

  return (
    <div className="anim-rise" data-testid="coach-dashboard">
      <TopBar testId="coach-dashboard-top" title={t('coachDash.title')} eyebrow={t('platform.coachPortal')} />

      {q.isLoading || !d ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-6">
          <CoachTrialBanner plan={planQ.data} />
          <CoachChecklist totalClients={d.totalClients} />

          {/* KPI cards */}
          <ResponsiveGrid cols={3}>
            <DashboardCard icon="user" value={d.totalClients} label={t('coachDash.totalClients')} hint={`${d.activeClients} ${t('coachDash.activeClients').toLowerCase()}`} onClick={() => navigate('/coach/clients')} />
            <DashboardCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} hint={t('coachDash.avgWorkouts', { n: d.avgWorkouts7d })} tone="brand" onClick={() => navigate('/coach/reports')} />
            <DashboardCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments > 0 ? 'warn' : 'default'} onClick={() => navigate('/coach/assessments')} />
            <DashboardCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
            <DashboardCard icon="info" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} onClick={() => navigate('/coach/messages')} />
            <DashboardCard icon="activity" value={d.activeClients} label={t('coachDash.activeClients')} />
          </ResponsiveGrid>

          {/* Revenue (tracking only) */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.revenue')}</h2>
            <ResponsiveGrid cols={3}>
              <DashboardCard icon="bolt" value={`${d.monthlyRevenue} ${d.currency}`} label={t('coachDash.monthlyRevenue')} tone="brand" />
              <DashboardCard icon="chart" value={`${d.expectedRevenue} ${d.currency}`} label={t('coachDash.expectedRevenue')} />
              <DashboardCard icon="info" value={`${d.lostRevenue} ${d.currency}`} label={t('coachDash.lostRevenue')} tone={d.lostRevenue > 0 ? 'danger' : 'default'} />
            </ResponsiveGrid>
          </section>

          {/* Subscriptions */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.subscriptions')}</h2>
            <ResponsiveGrid cols={3}>
              <DashboardCard icon="user" value={d.subs.trial} label={t('subscription.status.trial')} />
              <DashboardCard icon="user" value={d.subs.active} label={t('subscription.status.active')} tone="brand" />
              <DashboardCard icon="user" value={d.subs.pending} label={t('subscription.status.pending')} tone={d.subs.pending > 0 ? 'warn' : 'default'} />
              <DashboardCard icon="user" value={d.subs.expired} label={t('subscription.status.expired')} tone={d.subs.expired > 0 ? 'danger' : 'default'} />
              <DashboardCard icon="user" value={d.subs.cancelled} label={t('subscription.status.cancelled')} tone={d.subs.cancelled > 0 ? 'danger' : 'default'} />
              <DashboardCard icon="calendar" value={`${d.expiring7} / ${d.expiring30}`} label={t('coachDash.expiring')} hint={t('coachDash.expiringHint')} tone={d.expiring7 > 0 ? 'warn' : 'default'} />
            </ResponsiveGrid>
          </section>

          {/* Growth + retention */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.growth')}</h2>
            <ResponsiveGrid cols={3}>
              <DashboardCard icon="plus" value={d.newMonth} label={t('coachDash.newClients')} hint={t('coachDash.newHint', { today: d.newToday, week: d.newWeek })} />
              <DashboardCard icon="target" value={`${d.retention.d30}%`} label={t('coachDash.retention')} hint={`7d ${d.retention.d7}% · 90d ${d.retention.d90}%`} tone="brand" />
              <DashboardCard icon="activity" value={`${d.churn.d30}%`} label={t('coachDash.churn')} hint={`7d ${d.churn.d7}% · 90d ${d.churn.d90}%`} tone={d.churn.d30 > 0 ? 'danger' : 'default'} />
            </ResponsiveGrid>
          </section>

          {/* Your activity */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.activity')}</h2>
            <ResponsiveGrid cols={3}>
              <DashboardCard icon="list" value={d.templatesCreated} label={t('coachDash.templates')} onClick={() => navigate('/coach/templates')} />
              <DashboardCard icon="check" value={d.assessmentsReviewed} label={t('coachDash.assessmentsReviewed')} />
              <DashboardCard icon="info" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} onClick={() => navigate('/coach/messages')} />
            </ResponsiveGrid>
          </section>

          {/* Quick actions */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.quickActions')}</h2>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <QuickAction icon="plus" label={t('coachDash.addClient')} onClick={() => navigate('/coach/clients?new=1')} />
              <QuickAction icon="list" label={t('coachDash.createTemplate')} onClick={() => navigate('/coach/templates/new')} />
              <QuickAction icon="dumbbell" label={t('coachDash.openLibrary')} onClick={() => navigate('/coach/library')} />
              <QuickAction icon="check" label={t('coachDash.reviewAssessments')} onClick={() => navigate('/coach/assessments')} />
              <QuickAction icon="info" label={t('coachDash.sendBroadcast')} onClick={() => navigate('/coach/messages')} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Needs attention */}
            <section>
              <h2 className="h2 mb-2">{t('coachDash.needsAttention')}</h2>
              {attention.length === 0 ? (
                <div className="card py-8 text-center text-sm text-earth-muted">{t('coachDash.allGood')}</div>
              ) : (
                <div className="card divide-y divide-line-soft">
                  {attention.map((c) => (
                    <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} t={t} lang={i18n.language} />
                  ))}
                </div>
              )}
            </section>

            {/* Recent activity */}
            <section>
              <h2 className="h2 mb-2">{t('coachDash.recentActivity')}</h2>
              {recent.length === 0 ? (
                <div className="card py-8 text-center text-sm text-earth-muted">{t('coachDash.noClients')}</div>
              ) : (
                <div className="card divide-y divide-line-soft">
                  {recent.map((c) => (
                    <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} t={t} lang={i18n.language} />
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Adherence overview */}
          {chart.length > 0 && (
            <section>
              <h2 className="h2 mb-2">{t('coachDash.adherenceOverview')}</h2>
              <div className="card">
                <BarChart data={chart} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function firstName(name: string): string {
  return (name || '?').trim().split(/\s+/)[0].slice(0, 8);
}

function QuickAction({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card-tap flex items-center gap-3 text-start">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 truncate text-sm font-medium">{label}</span>
    </button>
  );
}

function ClientRow({ row, onOpen, t, lang }: { row: ClientDashboardRow; onOpen: () => void; t: (k: string, o?: Record<string, unknown>) => string; lang: string }) {
  const name = row.client.displayName || row.client.email;
  return (
    <button type="button" onClick={onOpen} className="row w-full text-start">
      <Avatar name={name} photoUrl={row.client.photoUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        <span className="block truncate text-[12px] text-earth-subtle">
          {row.lastActivity ? t('coachDash.lastActive', { date: shortDate(row.lastActivity, lang) }) : t('coachDash.neverActive')}
        </span>
      </span>
      <span className="font-mono text-xs text-earth-subtle">{t('coachDash.workoutsThisWeek', { n: row.workouts7d })}</span>
      <Icon name="chevron" size={16} className="text-earth-subtle" />
    </button>
  );
}
