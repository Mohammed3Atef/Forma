import { useMemo } from 'react';
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
          {/* KPI cards */}
          <ResponsiveGrid cols={3}>
            <DashboardCard icon="user" value={d.totalClients} label={t('coachDash.totalClients')} hint={`${d.activeClients} ${t('coachDash.activeClients').toLowerCase()}`} onClick={() => navigate('/coach/clients')} />
            <DashboardCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} hint={t('coachDash.avgWorkouts', { n: d.avgWorkouts7d })} tone="brand" onClick={() => navigate('/coach/reports')} />
            <DashboardCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments > 0 ? 'warn' : 'default'} onClick={() => navigate('/coach/assessments')} />
            <DashboardCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
            <DashboardCard icon="info" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} onClick={() => navigate('/coach/messages')} />
            <DashboardCard icon="activity" value={d.activeClients} label={t('coachDash.activeClients')} />
          </ResponsiveGrid>

          {/* Quick actions */}
          <section>
            <h2 className="h2 mb-2">{t('coachDash.quickActions')}</h2>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <QuickAction icon="plus" label={t('coachDash.addClient')} onClick={() => navigate('/coach/clients?new=1')} />
              <QuickAction icon="list" label={t('coachDash.createTemplate')} onClick={() => navigate('/coach/templates/new')} />
              <QuickAction icon="dumbbell" label={t('coachDash.openLibrary')} onClick={() => navigate('/coach/library')} />
              <QuickAction icon="check" label={t('coachDash.reviewAssessments')} onClick={() => navigate('/coach/assessments')} />
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
