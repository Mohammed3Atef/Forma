import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { TextInput } from '@/components/ui/Field';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { useBack } from '@/hooks/useBack';
import { showToast } from '@/stores/toastStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUser, setAccountStatus } from '@/services/platform/accountsApi';
import { listMyClients } from '@/services/platform/coachApi';
import {
  coachPlanState,
  extendCoachTrial,
  getCoachPlan,
  getCoachPlanChangeRequest,
  renewCoachPlan,
  resolvePlanChangeRequest,
  setCoachMaxClients,
  setCoachPlanEndsAt,
  setCoachTier,
  trialDaysLeft,
  type CoachTierKey,
} from '@/services/platform/coachPlanApi';
import { listCoachPlanTiers, tierLabel } from '@/services/platform/coachPlanTiersApi';
import { shortDate } from '@/lib/utils';

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Super-admin: manage one coach's plan tier, client limit, end date, trial,
 *  account, and any pending plan-change request. */
export function AdminCoachDetail() {
  const { t, i18n } = useTranslation();
  const { coachId = '' } = useParams();
  const goBack = useBack('/admin/coaches');
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const online = useOnlineStatus(); // management mutations require connectivity
  const meId = useSession((s) => s.account?.id ?? '');
  const [limit, setLimit] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');

  const coach = useQuery({ queryKey: ['coachUser', coachId], queryFn: () => fetchUser(coachId), enabled: isSuper && !!coachId });
  const plan = useQuery({ queryKey: ['coachPlanAdmin', coachId], queryFn: () => getCoachPlan(coachId), enabled: isSuper && !!coachId });
  const reqQ = useQuery({ queryKey: ['coachPlanRequest', coachId], queryFn: () => getCoachPlanChangeRequest(coachId), enabled: isSuper && !!coachId });
  const clientsQ = useQuery({ queryKey: ['adminCoachClients', coachId], queryFn: () => listMyClients(coachId), enabled: isSuper && !!coachId });
  const tiersQ = useQuery({ queryKey: ['coachPlanTiers'], queryFn: () => listCoachPlanTiers(), enabled: isSuper });
  const tiers = tiersQ.data ?? [];

  useEffect(() => {
    setEndDate(plan.data?.endsAt ? toIso(plan.data.endsAt) : '');
  }, [plan.data?.endsAt]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['coachPlanAdmin', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachUser', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
  };
  const onMutationError = (title: string) => (e: unknown) =>
    void alertDialog({ title, message: e instanceof Error ? e.message : t('common.errorGeneric') });
  const onMutationSuccess = (title: string) => () => {
    invalidate();
    showToast({ title, variant: 'success' });
  };

  const tier = useMutation({ mutationFn: (tk: CoachTierKey) => setCoachTier(coachId, tk), onSuccess: onMutationSuccess(t('adminCoaches.changeTier')), onError: onMutationError(t('adminCoaches.changeTier')) });
  const extend = useMutation({ mutationFn: (days: number) => extendCoachTrial(coachId, days), onSuccess: onMutationSuccess(t('adminCoaches.extendTrial')), onError: onMutationError(t('adminCoaches.extendTrial')) });
  const renew = useMutation({ mutationFn: () => renewCoachPlan(coachId), onSuccess: onMutationSuccess(t('adminCoaches.renew')), onError: onMutationError(t('adminCoaches.renew')) });
  const cap = useMutation({ mutationFn: (n: number) => setCoachMaxClients(coachId, n), onSuccess: () => { setLimit(''); onMutationSuccess(t('adminCoaches.setLimit'))(); }, onError: onMutationError(t('adminCoaches.setLimit')) });
  const ends = useMutation({ mutationFn: (ms: number | null) => setCoachPlanEndsAt(coachId, ms), onSuccess: onMutationSuccess(t('admin.setEndDate')), onError: onMutationError(t('admin.setEndDate')) });
  const acct = useMutation({
    mutationFn: (s: 'active' | 'suspended') => setAccountStatus(coach.data!, s),
    onSuccess: (_v, s) => {
      onMutationSuccess(t(s === 'suspended' ? 'adminCoaches.suspend' : 'adminCoaches.reactivate'))();
      // This is the one AdminCoachDetail mutation that changes the coach's
      // actual `accountStatus` (not just plan/capacity fields) — the other
      // pages that cache that same user record (`AdminAccounts`'s paginated
      // list, `AdminAssignments`'s role-scoped picker) would otherwise show a
      // stale status until their own staleTime lapses.
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['usersByRole', 'coach'] });
    },
    onError: (e, s) => onMutationError(t(s === 'suspended' ? 'adminCoaches.suspend' : 'adminCoaches.reactivate'))(e),
  });
  const onResolved = (title: string) => () => {
    setNote('');
    void qc.invalidateQueries({ queryKey: ['coachPlanRequest', coachId] });
    void qc.invalidateQueries({ queryKey: ['planRequests', 'pending'] });
    invalidate();
    showToast({ title, variant: 'success' });
  };
  // Approve APPLIES the requested change (tier and/or cap), then records the decision.
  const approve = useMutation({
    mutationFn: async () => {
      const cur = reqQ.data;
      if (cur?.requestedTier) await setCoachTier(coachId, cur.requestedTier);
      if (cur?.requestedMaxClients) await setCoachMaxClients(coachId, cur.requestedMaxClients);
      // A reason-only request (no tier/cap change) is a RENEWAL request — extend the term.
      if (!cur?.requestedTier && !cur?.requestedMaxClients) await renewCoachPlan(coachId);
      await resolvePlanChangeRequest(coachId, meId, 'accepted', note);
    },
    onSuccess: onResolved(t('admin.approveRequest')),
    onError: onMutationError(t('admin.approveRequest')),
  });
  const reject = useMutation({
    mutationFn: () => resolvePlanChangeRequest(coachId, meId, 'rejected', note),
    onSuccess: onResolved(t('admin.rejectRequest')),
    onError: onMutationError(t('admin.rejectRequest')),
  });

  if (!isSuper) return <Navigate to="/admin" replace />;
  const p = plan.data;
  const state = coachPlanState(p ?? null);
  const daysLeft = p ? trialDaysLeft(p) : null;
  const r = reqQ.data;
  const pendingReq = r?.status === 'pending';
  const clientCount = clientsQ.data ? clientsQ.data.filter((c) => c.accountStatus !== 'disabled').length : p?.activeClientCount ?? 0;
  const coachName = coach.data?.displayName || coach.data?.email || '';

  const doRenew = async () => {
    if (await confirmDialog({ title: t('adminCoaches.renew'), message: t('adminCoaches.confirmRenew', { name: coachName }) })) renew.mutate();
  };
  const doExtend = async () => {
    if (await confirmDialog({ title: t('adminCoaches.extendTrial'), message: t('adminCoaches.confirmExtendTrial', { n: 15, name: coachName }) })) extend.mutate(15);
  };
  const doSetLimit = async () => {
    const n = Number(limit);
    if (await confirmDialog({ title: t('adminCoaches.setLimit'), message: t('adminCoaches.confirmSetLimit', { n, name: coachName }) })) cap.mutate(n);
  };
  const doSetEndDate = async () => {
    if (await confirmDialog({ title: t('admin.setEndDate'), message: t('admin.confirmSetEndDate', { date: shortDate(endDate, i18n.language), name: coachName }) })) {
      ends.mutate(new Date(`${endDate}T00:00:00`).getTime());
    }
  };
  const doClearEndDate = async () => {
    if (await confirmDialog({ title: t('admin.clearEndDate'), message: t('admin.confirmClearEndDate', { name: coachName }), danger: true })) ends.mutate(null);
  };
  const doApprove = async () => {
    const changes = [
      r?.requestedTier ? t('admin.requestedTier') + ': ' + tierLabel(tiers, r.requestedTier, t) : null,
      r?.requestedMaxClients ? t('adminCoaches.clientLimit') + ': ' + r.requestedMaxClients : null,
      !r?.requestedTier && !r?.requestedMaxClients ? t('admin.approveApplies') : null,
    ].filter(Boolean).join(' · ');
    if (await confirmDialog({ title: t('admin.approveRequest'), message: `${t('admin.confirmApproveRequest', { name: coachName })} ${changes}` })) approve.mutate();
  };

  return (
    <div data-testid="admin-coach-detail">
      <TopBar title={coach.data?.displayName || t('adminCoaches.coach')} eyebrow={t('platform.superAdmin')} onBack={goBack} />
      {coach.isLoading ? (
        <LoadingState variant="list" count={4} />
      ) : (
        <div className="space-y-5">
          {pendingReq && r ? (
            <section className="card space-y-3 border-brand/40" data-testid="coach-plan-request-card">
              <h2 className="h2">{t('admin.requestFrom')}</h2>
              {r.requestedTier ? <Row label={t('admin.requestedTier')} value={tierLabel(tiers, r.requestedTier, t)} /> : null}
              {r.requestedMaxClients ? <Row label={t('adminCoaches.clientLimit')} value={String(r.requestedMaxClients)} /> : null}
              {r.reason ? <p className="text-sm text-earth-muted">{r.reason}</p> : null}
              <textarea className="input min-h-16" placeholder={t('admin.requestReason')} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" data-testid="coach-plan-approve" disabled={approve.isPending || reject.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void doApprove()}>{t('admin.approveRequest')}</button>
                <button type="button" className="btn-ghost" data-testid="coach-plan-reject" disabled={approve.isPending || reject.isPending || !online} onClick={() => reject.mutate()}>{t('admin.rejectRequest')}</button>
              </div>
              <p className="text-[12px] text-earth-subtle">{t('admin.approveApplies')}</p>
            </section>
          ) : null}

          <section className="card space-y-2">
            <Row label={t('adminCoaches.plan')} value={tierLabel(tiers, p?.plan ?? 'none', t)} />
            <Row label={t('subscription.accountTitle')} value={t(`adminCoaches.state.${state}`)} />
            <Row label={t('adminCoaches.clientsUsed')} value={p ? `${clientCount} / ${p.maxClients}` : String(clientCount)} />
            <Row label={t('admin.endDate')} value={p?.endsAt ? shortDate(toIso(p.endsAt), i18n.language) : '—'} />
            {daysLeft != null && state !== 'expired' ? <Row label={t('adminCoaches.daysLeftLabel')} value={t('subscription.daysLeft', { n: Math.max(0, daysLeft) })} /> : null}
            <Row label={t('admin.started')} value={p?.startedAt ? shortDate(toIso(p.startedAt), i18n.language) : '—'} />
            <Row label={t('adminCoaches.accountStatus')} value={t(`subscription.acct.${coach.data?.accountStatus ?? 'active'}`)} />
          </section>

          {p?.history?.length ? (
            <section className="space-y-2">
              <h2 className="h2">{t('admin.planHistory')}</h2>
              <div className="card divide-y divide-line-soft p-0">
                {[...p.history].reverse().slice(0, 15).map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 truncate text-sm">
                      {t(`coachPlan.hist.${h.action}`, { defaultValue: h.action })}
                      {h.detail ? ` · ${h.detail}` : ''}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-earth-subtle">{shortDate(toIso(h.at), i18n.language)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h2 className="h2">{t('adminCoaches.changeTier')}</h2>
            <div className="flex flex-wrap gap-2">
              {tiers.map((tr) => (
                <button key={tr.key} type="button" data-testid={`coach-tier-${tr.key}`} disabled={tier.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => tier.mutate(tr.key)} className={`chip ${p?.plan === tr.key ? 'chip-on' : ''}`}>
                  {tierLabel(tiers, tr.key, t)} · {tr.maxClients}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="h2">{t('adminCoaches.actions')}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="chip" data-testid="coach-renew" disabled={renew.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={() => void doRenew()}>{t('adminCoaches.renew')}</button>
              <button type="button" className="chip" data-testid="coach-extend-trial" disabled={extend.isPending || !online} onClick={() => void doExtend()}>{t('adminCoaches.extendTrial')}</button>
              {coach.data?.accountStatus === 'suspended' ? (
                <button type="button" className="chip" data-testid="coach-reactivate" disabled={acct.isPending || !online} onClick={() => acct.mutate('active')}>{t('adminCoaches.reactivate')}</button>
              ) : (
                <button type="button" className="chip text-danger" data-testid="coach-suspend" disabled={acct.isPending || !online} title={!online ? t('offline.actionDisabled') : undefined} onClick={async () => { if (await confirmDialog({ title: t('adminCoaches.suspend'), message: t('adminCoaches.confirmSuspend'), danger: true })) acct.mutate('suspended'); }}>{t('adminCoaches.suspend')}</button>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <TextInput
                label={t('adminCoaches.clientLimit')}
                srOnlyLabel
                fieldClassName="max-w-[140px]"
                inputMode="numeric"
                data-testid="coach-limit-input"
                placeholder={t('adminCoaches.clientLimit')}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                error={limit.trim() !== '' && !(Number(limit) >= 0) ? t('adminCoaches.limitInvalid') : undefined}
              />
              <button type="button" className="chip" data-testid="coach-limit-save" disabled={cap.isPending || !(Number(limit) >= 0) || limit.trim() === ''} onClick={() => void doSetLimit()}>{t('adminCoaches.setLimit')}</button>
            </div>
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <TextInput
                label={t('admin.setEndDate')}
                srOnlyLabel
                fieldClassName="max-w-[180px]"
                type="date"
                data-testid="coach-enddate-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <button type="button" className="chip" data-testid="coach-enddate-save" disabled={ends.isPending || !endDate} onClick={() => void doSetEndDate()}>{t('admin.setEndDate')}</button>
              <button type="button" className="chip text-earth-subtle" data-testid="coach-enddate-clear" disabled={ends.isPending || !p?.endsAt} onClick={() => void doClearEndDate()}>{t('admin.clearEndDate')}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-2 last:border-0 last:pb-0">
      <span className="text-sm text-earth-subtle">{label}</span>
      <span className="text-end text-sm font-medium">{value}</span>
    </div>
  );
}
