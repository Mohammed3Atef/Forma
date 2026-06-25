import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { confirmDialog } from '@/stores/dialogStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUserRecord } from '@/services/accounts/accountService';
import { setAccountStatus } from '@/services/platform/accountsApi';
import { listMyClients } from '@/services/platform/coachApi';
import {
  COACH_PLAN_TIERS,
  coachPlanState,
  extendCoachTrial,
  getCoachPlan,
  getCoachPlanChangeRequest,
  resolvePlanChangeRequest,
  setCoachMaxClients,
  setCoachPlanEndsAt,
  setCoachTier,
  trialDaysLeft,
  type CoachTierKey,
} from '@/services/platform/coachPlanApi';
import { shortDate } from '@/lib/utils';

const TIERS: CoachTierKey[] = ['trial', 'starter', 'pro', 'enterprise'];
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Super-admin: manage one coach's plan tier, client limit, end date, trial,
 *  account, and any pending plan-change request. */
export function AdminCoachDetail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { coachId = '' } = useParams();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const meId = useSession((s) => s.account?.id ?? '');
  const [limit, setLimit] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');

  const coach = useQuery({ queryKey: ['coachUser', coachId], queryFn: () => fetchUserRecord(coachId), enabled: isSuper && !!coachId });
  const plan = useQuery({ queryKey: ['coachPlanAdmin', coachId], queryFn: () => getCoachPlan(coachId), enabled: isSuper && !!coachId });
  const reqQ = useQuery({ queryKey: ['coachPlanRequest', coachId], queryFn: () => getCoachPlanChangeRequest(coachId), enabled: isSuper && !!coachId });
  const clientsQ = useQuery({ queryKey: ['adminCoachClients', coachId], queryFn: () => listMyClients(coachId), enabled: isSuper && !!coachId });

  useEffect(() => {
    setEndDate(plan.data?.endsAt ? toIso(plan.data.endsAt) : '');
  }, [plan.data?.endsAt]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['coachPlanAdmin', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachUser', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
  };
  const tier = useMutation({ mutationFn: (tk: CoachTierKey) => setCoachTier(coachId, tk), onSuccess: invalidate });
  const extend = useMutation({ mutationFn: (days: number) => extendCoachTrial(coachId, days), onSuccess: invalidate });
  const cap = useMutation({ mutationFn: (n: number) => setCoachMaxClients(coachId, n), onSuccess: () => { setLimit(''); invalidate(); } });
  const ends = useMutation({ mutationFn: (ms: number | null) => setCoachPlanEndsAt(coachId, ms), onSuccess: invalidate });
  const acct = useMutation({ mutationFn: (s: 'active' | 'suspended') => setAccountStatus(coach.data!, s), onSuccess: invalidate });
  const onResolved = () => {
    setNote('');
    void qc.invalidateQueries({ queryKey: ['coachPlanRequest', coachId] });
    void qc.invalidateQueries({ queryKey: ['planRequests', 'pending'] });
    invalidate();
  };
  // Approve APPLIES the requested change (tier and/or cap), then records the decision.
  const approve = useMutation({
    mutationFn: async () => {
      const cur = reqQ.data;
      if (cur?.requestedTier) await setCoachTier(coachId, cur.requestedTier);
      if (cur?.requestedMaxClients) await setCoachMaxClients(coachId, cur.requestedMaxClients);
      await resolvePlanChangeRequest(coachId, meId, 'accepted', note);
    },
    onSuccess: onResolved,
  });
  const reject = useMutation({ mutationFn: () => resolvePlanChangeRequest(coachId, meId, 'rejected', note), onSuccess: onResolved });

  if (!isSuper) return <Navigate to="/admin" replace />;
  const p = plan.data;
  const state = coachPlanState(p ?? null);
  const daysLeft = p ? trialDaysLeft(p) : null;
  const r = reqQ.data;
  const pendingReq = r?.status === 'pending';
  const clientCount = clientsQ.data ? clientsQ.data.filter((c) => c.accountStatus !== 'disabled').length : p?.activeClientCount ?? 0;

  return (
    <div data-testid="admin-coach-detail">
      <TopBar title={coach.data?.displayName || t('adminCoaches.coach')} eyebrow={t('platform.superAdmin')} onBack={() => navigate('/admin/coaches')} />
      {coach.isLoading ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-5">
          {pendingReq && r ? (
            <section className="card space-y-3 border-brand/40" data-testid="coach-plan-request-card">
              <h2 className="h2">{t('admin.requestFrom')}</h2>
              {r.requestedTier ? <Row label={t('admin.requestedTier')} value={t(`adminCoaches.tier.${r.requestedTier}`)} /> : null}
              {r.requestedMaxClients ? <Row label={t('adminCoaches.clientLimit')} value={String(r.requestedMaxClients)} /> : null}
              {r.reason ? <p className="text-sm text-earth-muted">{r.reason}</p> : null}
              <textarea className="input min-h-16" placeholder={t('admin.requestReason')} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" data-testid="coach-plan-approve" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate()}>{t('admin.approveRequest')}</button>
                <button type="button" className="btn-ghost" data-testid="coach-plan-reject" disabled={approve.isPending || reject.isPending} onClick={() => reject.mutate()}>{t('admin.rejectRequest')}</button>
              </div>
              <p className="text-[12px] text-earth-subtle">{t('admin.approveApplies')}</p>
            </section>
          ) : null}

          <section className="card space-y-2">
            <Row label={t('adminCoaches.plan')} value={t(`adminCoaches.tier.${p?.plan ?? 'none'}`)} />
            <Row label={t('subscription.accountTitle')} value={t(`adminCoaches.state.${state}`)} />
            <Row label={t('adminCoaches.clientsUsed')} value={p ? `${clientCount} / ${p.maxClients}` : String(clientCount)} />
            <Row label={t('admin.endDate')} value={p?.endsAt ? shortDate(toIso(p.endsAt), i18n.language) : '—'} />
            {p?.plan === 'trial' && daysLeft != null ? <Row label={t('adminCoaches.trialDaysLeft')} value={t('subscription.daysLeft', { n: Math.max(0, daysLeft) })} /> : null}
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
              {TIERS.map((tk) => (
                <button key={tk} type="button" data-testid={`coach-tier-${tk}`} disabled={tier.isPending} onClick={() => tier.mutate(tk)} className={`chip ${p?.plan === tk ? 'chip-on' : ''}`}>
                  {t(`adminCoaches.tier.${tk}`)} · {COACH_PLAN_TIERS[tk].maxClients}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="h2">{t('adminCoaches.actions')}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="chip" data-testid="coach-extend-trial" disabled={extend.isPending} onClick={() => extend.mutate(15)}>{t('adminCoaches.extendTrial')}</button>
              {coach.data?.accountStatus === 'suspended' ? (
                <button type="button" className="chip" data-testid="coach-reactivate" disabled={acct.isPending} onClick={() => acct.mutate('active')}>{t('adminCoaches.reactivate')}</button>
              ) : (
                <button type="button" className="chip text-danger" data-testid="coach-suspend" disabled={acct.isPending} onClick={async () => { if (await confirmDialog({ title: t('adminCoaches.suspend'), message: t('adminCoaches.confirmSuspend'), danger: true })) acct.mutate('suspended'); }}>{t('adminCoaches.suspend')}</button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input className="input max-w-[140px]" inputMode="numeric" data-testid="coach-limit-input" placeholder={t('adminCoaches.clientLimit')} value={limit} onChange={(e) => setLimit(e.target.value)} />
              <button type="button" className="chip" data-testid="coach-limit-save" disabled={cap.isPending || !(Number(limit) >= 0) || limit.trim() === ''} onClick={() => cap.mutate(Number(limit))}>{t('adminCoaches.setLimit')}</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input className="input max-w-[180px]" type="date" data-testid="coach-enddate-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <button type="button" className="chip" data-testid="coach-enddate-save" disabled={ends.isPending || !endDate} onClick={() => ends.mutate(new Date(`${endDate}T00:00:00`).getTime())}>{t('admin.setEndDate')}</button>
              <button type="button" className="chip text-earth-subtle" data-testid="coach-enddate-clear" disabled={ends.isPending || !p?.endsAt} onClick={() => ends.mutate(null)}>{t('admin.clearEndDate')}</button>
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
