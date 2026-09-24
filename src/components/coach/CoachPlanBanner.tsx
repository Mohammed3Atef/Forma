import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { getMyPlanRequest } from '@/services/platform/coachPlanRequestsApi';
import { useLocalized } from '@/hooks/useLocalized';
import { useCoachPlan } from './CoachPlanProvider';

const HOUR_MS = 3_600_000;

/**
 * App-wide coach plan alert: a danger banner when the plan has lapsed
 * (expired/suspended) and a warn banner when a PAID term ends within 5 days.
 * Trials keep their own countdown banner on the dashboard (CoachTrialBanner),
 * so this skips the trial-countdown case to avoid a double banner.
 *
 * A separate, non-blocking notice renders alongside either of the above when
 * the coach has an awaiting paid-plan request — its own independent
 * countdown from the request's `confirmationDeadline`, never conflated with
 * the plan's own `endsAt` countdown. The coach's real plan stays exactly as
 * it was until a super-admin confirms payment.
 */
export function CoachPlanBanner() {
  const { state, daysLeft } = useCoachPlan();
  const { t } = useTranslation();
  const loc = useLocalized();
  const navigate = useNavigate();
  const reqQ = useQuery({ queryKey: ['coachPlanRequest', 'mine'], queryFn: getMyPlanRequest, refetchInterval: 60_000 });
  const req = reqQ.data;
  const awaiting = req?.status === 'awaiting' || req?.status === 'processing';

  const lapsed = state === 'expired' || state === 'suspended';
  const endingSoon = state === 'active' && daysLeft != null && daysLeft <= 5;

  const planBanner = lapsed || endingSoon ? (
    <div
      className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 ${lapsed ? 'border-danger/50 bg-danger/10 text-danger' : 'border-warn/50 bg-warn/10 text-warn'}`}
      data-testid="coach-plan-banner"
    >
      <Icon name={lapsed ? 'info' : 'timer'} size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        {lapsed ? t(state === 'suspended' ? 'coachPlan.banner.suspended' : 'coachPlan.banner.expired') : t('coachPlan.banner.endingSoon', { n: Math.max(0, daysLeft ?? 0) })}
      </p>
      <button type="button" className="btn-ghost h-9 shrink-0 px-3 text-[13px]" data-testid="coach-plan-renew" onClick={() => navigate('/coach/plan')}>
        {t('coachPlan.banner.renew')}
      </button>
    </div>
  ) : null;

  const requestBanner = awaiting && req ? (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-4 py-3 text-brand" data-testid="coach-plan-request-banner">
      <Icon name="bolt" size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium">
        {req.type === 'trial_expired'
          ? t('coachPlan.trialEndedAwaiting')
          : t('coachPlan.banner.requestAwaiting', { plan: loc(req.planSnapshot.label), n: Math.max(0, Math.ceil((req.confirmationDeadline - Date.now()) / HOUR_MS)) })}
      </p>
      <button type="button" className="btn-ghost h-9 shrink-0 px-3 text-[13px]" onClick={() => navigate('/coach/plan')}>
        {t('coachPlan.viewPlan')}
      </button>
    </div>
  ) : null;

  if (!planBanner && !requestBanner) return null;
  return (
    <>
      {planBanner}
      {requestBanner}
    </>
  );
}
