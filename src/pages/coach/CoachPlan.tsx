import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import {
  COACH_PLAN_TIERS,
  coachPlanState,
  trialDaysLeft,
  getCoachPlan,
  getCoachPlanChangeRequest,
  submitPlanChangeRequest,
  cancelPlanChangeRequest,
  type CoachTierKey,
} from '@/services/platform/coachPlanApi';
import { shortDate } from '@/lib/utils';

const UPGRADE_TIERS: CoachTierKey[] = ['starter', 'pro', 'enterprise'];

/** Coach-facing "My Plan": tier/status/usage/end-date + request an upgrade. */
export function CoachPlan() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<CoachTierKey | ''>('');
  const [reason, setReason] = useState('');

  const plan = useQuery({ queryKey: ['coachPlan', coachId], queryFn: () => getCoachPlan(coachId), enabled: !!coachId, staleTime: 300_000 });
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const req = useQuery({ queryKey: ['coachPlanRequest', coachId], queryFn: () => getCoachPlanChangeRequest(coachId), enabled: !!coachId });

  const submit = useMutation({
    mutationFn: () => submitPlanChangeRequest(coachId, { requestedTier: tier || undefined, reason }),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setTier('');
      void qc.invalidateQueries({ queryKey: ['coachPlanRequest', coachId] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelPlanChangeRequest(coachId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coachPlanRequest', coachId] }),
  });

  const p = plan.data;
  const state = coachPlanState(p ?? null);
  const used = clients.data ? clients.data.filter((c) => c.accountStatus !== 'disabled').length : p?.activeClientCount ?? 0;
  const daysLeft = p ? trialDaysLeft(p) : null;
  const pending = req.data?.status === 'pending';
  const statusTone = state === 'active' || state === 'trial' ? 'success' : state === 'none' ? 'default' : 'danger';

  return (
    <div data-testid="coach-plan">
      <PageHeader eyebrow={t('platform.coachPortal')} title={t('coachPlan.title')} />
      {plan.isLoading ? (
        <LoadingState variant="cards" count={4} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon="bolt" value={t(`adminCoaches.tier.${p?.plan ?? 'none'}`)} label={t('coachPlan.tier')} tone="brand" />
            <MetricCard icon="check" value={t(`adminCoaches.state.${state}`)} label={t('coachPlan.status')} tone={statusTone} />
            <MetricCard icon="user" value={`${used} / ${p?.maxClients ?? '—'}`} label={t('coachPlan.clientsUsed')} />
            <MetricCard
              icon="calendar"
              value={p?.endsAt ? shortDate(new Date(p.endsAt).toISOString().slice(0, 10), i18n.language) : daysLeft != null ? t('subscription.daysLeft', { n: Math.max(0, daysLeft) }) : '—'}
              label={t('coachPlan.endDate')}
              tone={daysLeft != null && daysLeft <= 7 ? 'warn' : 'default'}
            />
          </div>

          <DashboardSection title={t('coachPlan.requestUpgrade')} icon="bolt">
            {pending ? (
              <div className="card space-y-2" data-testid="coach-plan-request-card">
                <div className="flex items-center justify-between gap-3">
                  <span className="chip border-warn/50 text-warn">{t('coachPlan.pending')}</span>
                  <button type="button" className="text-sm text-earth-muted hover:text-white" disabled={cancel.isPending} onClick={() => cancel.mutate()} data-testid="coach-plan-cancel">
                    {t('coachPlan.cancelRequest')}
                  </button>
                </div>
                {req.data?.requestedTier ? <p className="text-sm">{t('coachPlan.desiredTier')}: {t(`adminCoaches.tier.${req.data.requestedTier}`)}</p> : null}
                {req.data?.reason ? <p className="text-sm text-earth-muted">{req.data.reason}</p> : null}
              </div>
            ) : (
              <>
                {req.data?.status === 'accepted' ? (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-success-light/40 bg-success-light/10 px-3 py-2 text-sm text-success-light" data-testid="coach-plan-accepted">
                    <Icon name="check" size={16} className="mt-0.5 shrink-0" />
                    <span>{t('coachPlan.accepted')}{req.data.adminNote ? ` — ${req.data.adminNote}` : ''}</span>
                  </div>
                ) : null}
                <button type="button" className="btn-primary" data-testid="coach-plan-request" onClick={() => setOpen(true)}>
                  <Icon name="bolt" size={16} /> {t('coachPlan.requestUpgrade')}
                </button>
                {req.data?.status === 'rejected' && req.data.adminNote ? (
                  <p className="mt-2 text-[12px] text-danger">{t('coachPlan.rejected')}: {req.data.adminNote}</p>
                ) : null}
              </>
            )}
          </DashboardSection>

          {p?.history?.length ? (
            <DashboardSection title={t('coachPlan.history')} icon="list">
              <div className="card divide-y divide-line-soft p-0">
                {[...p.history].reverse().slice(0, 12).map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 truncate text-sm">
                      {t(`coachPlan.hist.${h.action}`, { defaultValue: h.action })}
                      {h.detail ? ` · ${h.detail}` : ''}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-earth-subtle">{shortDate(new Date(h.at).toISOString().slice(0, 10), i18n.language)}</span>
                  </div>
                ))}
              </div>
            </DashboardSection>
          ) : null}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t('coachPlan.requestUpgrade')}>
        <div className="space-y-3">
          <div>
            <div className="label mb-2">{t('coachPlan.desiredTier')}</div>
            <div className="flex flex-wrap gap-2">
              {UPGRADE_TIERS.map((tk) => {
                const isCurrent = tk === p?.plan;
                return (
                  <button
                    key={tk}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setTier(tier === tk ? '' : tk)}
                    className={`chip ${tier === tk ? 'chip-on' : ''} ${isCurrent ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {t(`adminCoaches.tier.${tk}`)} · {COACH_PLAN_TIERS[tk].maxClients}
                    {isCurrent ? ` · ${t('coachPlan.current')}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
          <textarea className="input min-h-24" data-testid="coach-plan-reason" placeholder={t('coachPlan.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="coach-plan-request-submit" disabled={submit.isPending || !reason.trim()} onClick={() => submit.mutate()}>
            {t('coachPlan.submit')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
