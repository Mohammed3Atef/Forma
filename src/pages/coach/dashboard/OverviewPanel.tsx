import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MetricCard } from '@/components/ui/MetricCard';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import { CoachChecklist } from '@/pages/coach/onboarding/CoachChecklist';
import type { CoachDashboard } from '@/services/platform/coachDashboardApi';
import { shortDate } from '@/lib/utils';
import { AttentionRow, ClientRow, QuickAction, attentionAction, attentionReason } from './parts';

export function OverviewPanel({ d }: { d: CoachDashboard }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const attentionAll = useMemo(() => d.clients.filter((c) => c.needsAttention), [d.clients]);
  const attention = attentionAll.slice(0, 6);
  const recent = useMemo(
    () => [...d.clients].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')).slice(0, 6),
    [d.clients],
  );
  // The single most urgent client: oldest/never activity first among those needing attention.
  const worst = useMemo(
    () => [...attentionAll].sort((a, b) => (a.lastActivity ?? '').localeCompare(b.lastActivity ?? ''))[0] ?? null,
    [attentionAll],
  );
  const missed = useMemo(() => d.clients.filter((c) => c.workouts7d === 0).length, [d.clients]);
  const headlineBits = [
    missed > 0 ? t('coachDash.missedSessions', { n: missed }) : null,
    d.checkinsToReview > 0 ? t('coachDash.checkinsOverdue', { n: d.checkinsToReview }) : null,
    d.expiring7 > 0 ? t('coachDash.renewalsSoon', { n: d.expiring7 }) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <CoachChecklist totalClients={d.totalClients} />

      {/* Headline — real counts, not a generic greeting */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-[28px]">
          {attentionAll.length > 0 ? t('coachDash.needYouToday', { n: attentionAll.length }) : t('coachDash.allCaughtUp')}
        </h2>
        {headlineBits.length > 0 && <p className="mt-1.5 text-sm text-earth-muted">{headlineBits.join(' · ')}</p>}
      </div>

      {/* Featured at-risk client hero — the single most urgent case */}
      {worst && (
        <div className="card-featured">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <Avatar name={worst.client.displayName || worst.client.email} photoUrl={worst.client.photoUrl} size="lg" />
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-display text-lg font-semibold">{worst.client.displayName || worst.client.email}</h3>
                  <Pill tone="bad">{t('coachDash.atRisk')}</Pill>
                </div>
                <p className="text-sm text-earth-muted">{attentionReason(worst, t, i18n.language)}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => navigate(`/coach/messages/${worst.client.id}`)}>
                <Icon name="chat" size={14} /> {t('coachDash.message')}
              </button>
              <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/coach/client/${worst.client.id}`)}>
                {t('coachDash.openWorkspace')} <Icon name="chevron" size={14} className="rtl:rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon="user" value={d.totalClients} label={t('coachDash.totalClients')} hint={`${d.activeClients} ${t('coachDash.activeClients').toLowerCase()}`} onClick={() => navigate('/coach/clients')} />
        <MetricCard icon="target" value={`${d.adherencePct}%`} label={t('coachDash.adherence')} tone="brand" />
        <MetricCard icon="check" value={d.pendingAssessments} label={t('coachDash.pendingAssessments')} tone={d.pendingAssessments > 0 ? 'warn' : 'default'} onClick={() => navigate('/coach/assessments')} />
        <MetricCard icon="calendar" value={d.checkinsToReview} label={t('coachDash.checkins')} tone={d.checkinsToReview > 0 ? 'warn' : 'default'} />
        <MetricCard icon="chat" value={d.unreadMessages} label={t('coachDash.unread')} tone={d.unreadMessages > 0 ? 'danger' : 'default'} onClick={() => navigate('/coach/messages')} />
        <MetricCard icon="bolt" value={`${d.revenueThisMonth} ${d.currency}`} label={t('coachDash.revenueThisMonth')} tone="success" />
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
            <div className="card divide-y divide-line-soft overflow-hidden p-0">
              {attention.map((c) => (
                <AttentionRow
                  key={c.client.id}
                  row={c}
                  onOpen={() => navigate(`/coach/client/${c.client.id}`)}
                  onAction={() => navigate(attentionAction(c).to)}
                />
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title={t('coachDash.recentActivity')} icon="activity">
          {recent.length === 0 ? (
            <EmptyState icon="user" title={t('coachDash.noClients')} action={<button type="button" className="btn-primary" onClick={() => navigate('/coach/clients?new=1')}>{t('coachDash.addClient')}</button>} />
          ) : (
            <div className="card divide-y divide-line-soft overflow-hidden p-0 [&>button]:px-5">
              {recent.map((c) => (
                <ClientRow key={c.client.id} row={c} onOpen={() => navigate(`/coach/client/${c.client.id}`)} />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>

      {/* Upcoming renewals — real data, previously only surfaced inside Analytics */}
      <DashboardSection title={t('coachDash.upcomingRenewals')} icon="calendar">
        {d.renewals.length === 0 ? (
          <EmptyState icon="calendar" title={t('coachDash.noRenewals')} />
        ) : (
          <div className="card divide-y divide-line-soft overflow-hidden p-0">
            {d.renewals.slice(0, 6).map((r) => (
              <button key={r.clientId} type="button" onClick={() => navigate(`/coach/client/${r.clientId}`)} className="rowline w-full text-start">
                <span className="tk-ic"><Icon name="calendar" size={14} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{r.name}</span>
                  <span className="block text-[12px] text-earth-subtle">{shortDate(new Date(r.date).toISOString().slice(0, 10), i18n.language)}</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] text-earth">{r.amount} {r.currency}</span>
              </button>
            ))}
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
