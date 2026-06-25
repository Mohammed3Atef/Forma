import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { CoachChecklist } from '@/pages/coach/onboarding/CoachChecklist';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import { ClientRow, QuickAction } from './parts';

export function OverviewPanel({ d }: { d: CoachDashboard }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const attention = useMemo(() => d.clients.filter((c) => c.needsAttention).slice(0, 6), [d.clients]);
  const recent = useMemo(
    () => [...d.clients].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')).slice(0, 6),
    [d.clients],
  );

  return (
    <div className="space-y-6">
      <CoachChecklist totalClients={d.totalClients} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon="user" value={d.totalClients} label={t('coachDash.totalClients')} hint={`${d.activeClients} ${t('coachDash.activeClients').toLowerCase()}`} onClick={() => navigate('/coach/clients')} />
        <MetricCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} tone="brand" />
        <MetricCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments > 0 ? 'warn' : 'default'} onClick={() => navigate('/coach/assessments')} />
        <MetricCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
        <MetricCard icon="chat" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} onClick={() => navigate('/coach/messages')} />
        <MetricCard icon="bolt" value={`${d.expectedRevenue} ${d.currency}`} label={t('coachDash.expectedRevenue')} tone="success" />
      </div>

      <DashboardSection title={t('coachDash.quickActions')} icon="bolt">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <QuickAction icon="plus" label={t('coachDash.addClient')} onClick={() => navigate('/coach/clients?new=1')} />
          <QuickAction icon="list" label={t('coachDash.createTemplate')} onClick={() => navigate('/coach/templates/new')} />
          <QuickAction icon="dumbbell" label={t('coachDash.openLibrary')} onClick={() => navigate('/coach/library')} />
          <QuickAction icon="check" label={t('coachDash.reviewAssessments')} onClick={() => navigate('/coach/assessments')} />
          <QuickAction icon="chat" label={t('coachDash.sendBroadcast')} onClick={() => navigate('/coach/messages')} />
        </div>
      </DashboardSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection title={t('coachDash.needsAttention')} icon="info">
          {attention.length === 0 ? (
            <EmptyState icon="check" tone="brand" title={t('coachDash.allGood')} />
          ) : (
            <div className="card divide-y divide-line-soft p-0 [&>button]:px-5">
              {attention.map((c) => (
                <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} />
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title={t('coachDash.recentActivity')} icon="activity">
          {recent.length === 0 ? (
            <EmptyState icon="user" title={t('coachDash.noClients')} action={<button type="button" className="btn-primary" onClick={() => navigate('/coach/clients?new=1')}>{t('coachDash.addClient')}</button>} />
          ) : (
            <div className="card divide-y divide-line-soft p-0 [&>button]:px-5">
              {recent.map((c) => (
                <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
