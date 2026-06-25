import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MobileCardList } from '@/components/ui/MobileCardList';
import { EmptyState } from '@/components/ui/EmptyState';
import { downloadCsv } from '@/lib/csv';
import { shortDate } from '@/lib/utils';
import type { CoachDashboard, ClientDashboardRow } from '@/services/platform/coachDashboardApi';

export function ReportsPanel({ d }: { d: CoachDashboard }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const ranking = useMemo(() => [...d.clients].sort((a, b) => b.workouts7d - a.workouts7d), [d.clients]);

  const exportClients = () =>
    downloadCsv(
      'forma-clients',
      [t('coach.clients'), t('settings.email'), t('coach.last7Days'), t('assessment.title'), t('coachDash.recentActivity')],
      d.clients.map((r) => [r.client.displayName || '', r.client.email, r.workouts7d, t(`assessment.status.${r.assessment}`), r.lastActivity ?? '']),
    );
  const exportSubscriptions = () =>
    downloadCsv(
      'forma-subscriptions',
      [t('subscription.accountTitle'), '#'],
      (Object.keys(d.subs) as (keyof typeof d.subs)[]).map((k) => [t(`subscription.status.${k}`), d.subs[k]]),
    );
  const exportRevenue = () =>
    downloadCsv(
      'forma-revenue',
      [t('coachDash.revenue'), `${d.currency}`],
      [
        [t('coachDash.monthlyRevenue'), d.monthlyRevenue],
        [t('coachDash.expectedRevenue'), d.expectedRevenue],
        [t('coachDash.lostRevenue'), d.lostRevenue],
      ],
    );

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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} tone="brand" />
        <MetricCard icon="dumbbell" value={d.avgWorkouts7d} label={t('coachDash.avgWorkoutsLabel')} />
        <MetricCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments ? 'warn' : 'default'} />
        <MetricCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.missedCheckins')} tone={d.checkinsToReview ? 'warn' : 'default'} />
      </div>

      <DashboardSection title={t('coachDash.export')} icon="download">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={exportClients}><Icon name="download" size={16} /> {t('coachDash.exportClients')}</button>
          <button type="button" className="btn-ghost" onClick={exportSubscriptions}><Icon name="download" size={16} /> {t('coachDash.exportSubscriptions')}</button>
          <button type="button" className="btn-ghost" onClick={exportRevenue}><Icon name="download" size={16} /> {t('coachDash.exportRevenue')}</button>
        </div>
      </DashboardSection>

      <DashboardSection title={t('coachDash.ranking')} icon="chart">
        <div className="hidden lg:block">
          <DataTable
            caption={t('coachDash.ranking')}
            columns={columns}
            rows={ranking}
            rowKey={(r) => r.client.id}
            onRowClick={(r) => navigate(`/coach/client/${r.client.id}`)}
            empty={t('coachDash.noClients')}
          />
        </div>
        <div className="lg:hidden">
          <MobileCardList
            items={ranking}
            rowKey={(r) => r.client.id}
            onItemClick={(r) => navigate(`/coach/client/${r.client.id}`)}
            empty={<EmptyState icon="user" title={t('coachDash.noClients')} />}
            renderItem={(r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate font-medium">{r.client.displayName || r.client.email}</span>
                <span className="font-mono text-sm">
                  <span className={r.workouts7d > 0 ? 'text-brand' : 'text-earth-subtle'}>{r.workouts7d}</span>
                  <span className="text-earth-subtle"> {t('coach.workoutsShort')}</span>
                </span>
              </div>
            )}
          />
        </div>
      </DashboardSection>
    </div>
  );
}
