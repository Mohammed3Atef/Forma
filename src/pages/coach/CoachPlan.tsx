import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { DashboardSection } from '@/components/ui/DashboardSection';
import { MetricCard } from '@/components/ui/MetricCard';
import { LoadingState } from '@/components/ui/LoadingState';
import { Sheet } from '@/components/Sheet';
import { TextAreaField } from '@/components/ui/Field';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { alertDialog } from '@/stores/dialogStore';
import { listMyClients } from '@/services/platform/coachApi';
import { coachPlanState, trialDaysLeft, getCoachPlan, type CoachTierKey } from '@/services/platform/coachPlanApi';
import { getMyPlanRequest, submitPlanRequest, cancelPlanRequest } from '@/services/platform/coachPlanRequestsApi';
import { TRPCClientError } from '@/services/trpc';
import { listCoachPlanTiers, tierLabel } from '@/services/platform/coachPlanTiersApi';
import { useLocalized } from '@/hooks/useLocalized';
import { shortDate } from '@/lib/utils';

const HOUR_MS = 3_600_000;

/** Coach-facing "My Plan": tier/status/usage/end-date + request an upgrade. */
export function CoachPlan() {
  const { t, i18n } = useTranslation();
  const loc = useLocalized();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<CoachTierKey | ''>('');
  const [reason, setReason] = useState('');

  const plan = useQuery({ queryKey: ['coachPlan', coachId], queryFn: () => getCoachPlan(coachId), enabled: !!coachId, staleTime: 300_000 });
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const req = useQuery({ queryKey: ['coachPlanRequest', 'mine'], queryFn: getMyPlanRequest, enabled: !!coachId, refetchInterval: 60_000 });
  const tiersQ = useQuery({ queryKey: ['coachPlanTiers'], queryFn: () => listCoachPlanTiers(), enabled: !!coachId });
  const tiers = tiersQ.data ?? [];

  const submit = useMutation({
    mutationFn: () => submitPlanRequest(tier, reason || undefined),
    onSuccess: () => {
      setOpen(false);
      setReason('');
      setTier('');
      void qc.invalidateQueries({ queryKey: ['coachPlanRequest', 'mine'] });
    },
    onError: (e) => void alertDialog({ title: t('coachPlan.requestUpgrade'), message: e instanceof TRPCClientError ? e.message : t('common.errorGeneric') }),
  });
  const cancel = useMutation({
    mutationFn: () => cancelPlanRequest(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['coachPlanRequest', 'mine'] }),
    onError: (e) =>
      void alertDialog({
        title: t('coachPlan.cancelRequest'),
        message: e instanceof TRPCClientError ? e.message : t('common.errorGeneric'),
      }).then(() => qc.invalidateQueries({ queryKey: ['coachPlanRequest', 'mine'] })),
  });

  const p = plan.data;
  const upgradeTiers = tiers.filter((tr) => tr.key !== 'trial' && tr.key !== p?.plan);
  const state = coachPlanState(p ?? null);
  const used = clients.data ? clients.data.filter((c) => c.accountStatus !== 'disabled').length : p?.activeClientCount ?? 0;
  const daysLeft = p ? trialDaysLeft(p) : null;
  const r = req.data;
  const pending = r?.status === 'awaiting' || r?.status === 'processing';
  const hoursLeft = r && pending ? Math.max(0, Math.ceil((r.confirmationDeadline - Date.now()) / HOUR_MS)) : null;
  const statusTone = state === 'active' || state === 'trial' ? 'success' : state === 'none' ? 'default' : 'danger';

  return (
    <div data-testid="coach-plan">
      <PageHeader eyebrow={t('platform.coachPortal')} title={t('coachPlan.title')} />
      {plan.isLoading ? (
        <LoadingState variant="cards" count={4} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard icon="bolt" value={tierLabel(tiers, p?.plan ?? 'none', t)} label={t('coachPlan.tier')} tone="brand" />
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
            {pending && r ? (
              // Requested Plan — clearly separate from Current Plan above; the
              // request never implies the new plan is active until confirmed.
              <div className="card space-y-2" data-testid="coach-plan-request-card">
                <div className="flex items-center justify-between gap-3">
                  <span className="chip border-warn/50 text-warn">{t('coachPlan.pending')}</span>
                  {r.type !== 'trial_expired' && (
                    <button type="button" className="text-sm text-earth-muted hover:text-white" disabled={cancel.isPending} onClick={() => cancel.mutate()} data-testid="coach-plan-cancel">
                      {t('coachPlan.cancelRequest')}
                    </button>
                  )}
                </div>
                <p className="text-sm">{t('coachPlan.desiredTier')}: {loc(r.planSnapshot.label)} · {r.planSnapshot.maxClients} {t('admin.clients').toLowerCase()}</p>
                <p className="text-[12px] text-earth-subtle">
                  {r.type === 'trial_expired' ? t('coachPlan.trialEndedAwaiting') : t('coachPlan.awaitingConfirmation', { n: hoursLeft ?? 0 })}
                </p>
                {r.reason ? <p className="text-sm text-earth-muted">{r.reason}</p> : null}
              </div>
            ) : (
              <>
                {r?.status === 'rejected' ? (
                  <p className="mb-2 text-[12px] text-danger">{t('coachPlan.rejected')}{r.adminNote ? `: ${r.adminNote}` : ''}</p>
                ) : null}
                {r?.status === 'expired' ? <p className="mb-2 text-[12px] text-earth-subtle">{t('coachPlan.requestExpired')}</p> : null}
                <button type="button" className="btn-primary" data-testid="coach-plan-request" onClick={() => setOpen(true)}>
                  <Icon name="bolt" size={16} /> {t('coachPlan.requestUpgrade')}
                </button>
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

      <Sheet open={open} onClose={() => setOpen(false)} size="md" title={t('coachPlan.requestUpgrade')}>
        <div className="space-y-3">
          <div>
            <div className="label mb-2">{t('coachPlan.desiredTier')}</div>
            <div className="flex flex-wrap gap-2">
              {upgradeTiers.map((trCfg) => {
                const tk = trCfg.key;
                return (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setTier(tier === tk ? '' : tk)}
                    className={`chip ${tier === tk ? 'chip-on' : ''}`}
                  >
                    {tierLabel(tiers, tk, t)} · {trCfg.maxClients}
                  </button>
                );
              })}
            </div>
          </div>
          <TextAreaField label={t('field.reason')} className="min-h-24" data-testid="coach-plan-reason" placeholder={t('coachPlan.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn-primary w-full disabled:opacity-40" data-testid="coach-plan-request-submit" disabled={submit.isPending || !tier} onClick={() => submit.mutate()}>
            {t('coachPlan.submit')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
