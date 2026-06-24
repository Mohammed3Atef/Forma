import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { confirmDialog } from '@/stores/dialogStore';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUserRecord } from '@/services/accounts/accountService';
import { setAccountStatus } from '@/services/platform/accountsApi';
import {
  COACH_PLAN_TIERS,
  coachPlanState,
  extendCoachTrial,
  getCoachPlan,
  setCoachMaxClients,
  setCoachTier,
  trialDaysLeft,
  type CoachTierKey,
} from '@/services/platform/coachPlanApi';

const TIERS: CoachTierKey[] = ['trial', 'starter', 'pro', 'enterprise'];

/** Super-admin: manage one coach's plan tier, client limit, trial & account. */
export function AdminCoachDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { coachId = '' } = useParams();
  const qc = useQueryClient();
  const isSuper = useSession((s) => s.account?.role === 'super_admin');
  const [limit, setLimit] = useState('');

  const coach = useQuery({ queryKey: ['coachUser', coachId], queryFn: () => fetchUserRecord(coachId), enabled: isSuper && !!coachId });
  const plan = useQuery({ queryKey: ['coachPlanAdmin', coachId], queryFn: () => getCoachPlan(coachId), enabled: isSuper && !!coachId });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['coachPlanAdmin', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachUser', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachAdmin'] });
  };
  const tier = useMutation({ mutationFn: (tk: CoachTierKey) => setCoachTier(coachId, tk), onSuccess: invalidate });
  const extend = useMutation({ mutationFn: (days: number) => extendCoachTrial(coachId, days), onSuccess: invalidate });
  const cap = useMutation({ mutationFn: (n: number) => setCoachMaxClients(coachId, n), onSuccess: () => { setLimit(''); invalidate(); } });
  const acct = useMutation({ mutationFn: (s: 'active' | 'suspended') => setAccountStatus(coach.data!, s), onSuccess: invalidate });

  if (!isSuper) return <Navigate to="/admin" replace />;
  const p = plan.data;
  const state = coachPlanState(p ?? null);
  const daysLeft = p ? trialDaysLeft(p) : null;

  return (
    <div data-testid="admin-coach-detail">
      <TopBar title={coach.data?.displayName || t('adminCoaches.coach')} eyebrow={t('platform.superAdmin')} onBack={() => navigate('/admin/coaches')} />
      {coach.isLoading ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : (
        <div className="space-y-5">
          <section className="card space-y-2">
            <Row label={t('adminCoaches.plan')} value={t(`adminCoaches.tier.${p?.plan ?? 'none'}`)} />
            <Row label={t('subscription.accountTitle')} value={t(`adminCoaches.state.${state}`)} />
            <Row label={t('adminCoaches.clientsUsed')} value={p ? `${p.activeClientCount} / ${p.maxClients}` : '—'} />
            {p?.plan === 'trial' && daysLeft != null && <Row label={t('adminCoaches.trialDaysLeft')} value={t('subscription.daysLeft', { n: Math.max(0, daysLeft) })} />}
            <Row label={t('adminCoaches.accountStatus')} value={t(`subscription.acct.${coach.data?.accountStatus ?? 'active'}`)} />
          </section>

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
            <div className="flex items-center gap-2 pt-1">
              <input className="input max-w-[140px]" inputMode="numeric" data-testid="coach-limit-input" placeholder={t('adminCoaches.clientLimit')} value={limit} onChange={(e) => setLimit(e.target.value)} />
              <button type="button" className="chip" data-testid="coach-limit-save" disabled={cap.isPending || !(Number(limit) >= 0) || limit.trim() === ''} onClick={() => cap.mutate(Number(limit))}>{t('adminCoaches.setLimit')}</button>
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
