import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import { ClientRow } from './parts';

export function ClientsPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const pending = useMemo(() => d.clients.filter((c) => c.assessment === 'submitted' || c.assessment === 'updated_after_review'), [d.clients]);
  const inactive = useMemo(() => d.clients.filter((c) => c.workouts7d === 0), [d.clients]);
  const attention = useMemo(() => d.clients.filter((c) => c.needsAttention), [d.clients]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard icon="user" value={d.totalClients} label={t('coachDash.totalClients')} onClick={() => navigate('/coach/clients')} />
        <MetricCard icon="check" value={d.activeClients} label={t('coachDash.activeClients')} tone="success" />
        <MetricCard icon="info" value={attention.length} label={t('coachDash.needsAttention')} tone={attention.length ? 'warn' : 'default'} />
        <MetricCard icon="list" value={pending.length} label={t('coachDash.pendingAssessments')} tone={pending.length ? 'warn' : 'default'} onClick={() => navigate('/coach/assessments')} />
        <MetricCard icon="activity" value={inactive.length} label={t('coachDash.inactiveWeek')} tone={inactive.length ? 'danger' : 'default'} />
      </div>

      <DashboardSection title={t('coachDash.pendingAssessments')} icon="check" action={<button type="button" className="sec-link" onClick={() => navigate('/coach/assessments')}>{t('nav.coachAssessments')}</button>}>
        {pending.length === 0 ? (
          <EmptyState icon="check" tone="brand" title={t('coachDash.allGood')} />
        ) : (
          <div className="card divide-y divide-line-soft p-0 [&>button]:px-5">
            {pending.slice(0, 8).map((c) => (
              <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}/assessment`)} />
            ))}
          </div>
        )}
      </DashboardSection>

      <DashboardSection title={t('coachDash.inactiveWeek')} icon="activity" action={<button type="button" className="sec-link" onClick={() => navigate('/coach/clients')}>{t('coach.clients')}</button>}>
        {inactive.length === 0 ? (
          <EmptyState icon="check" tone="brand" title={t('coachDash.allActive')} />
        ) : (
          <div className="card divide-y divide-line-soft p-0 [&>button]:px-5">
            {inactive.slice(0, 8).map((c) => (
              <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} />
            ))}
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
