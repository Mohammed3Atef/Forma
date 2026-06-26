import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useCoachPlan } from './CoachPlanProvider';

/**
 * App-wide coach plan alert: a danger banner when the plan has lapsed
 * (expired/suspended) and a warn banner when a PAID term ends within 5 days.
 * Trials keep their own countdown banner on the dashboard (CoachTrialBanner),
 * so this skips the trial-countdown case to avoid a double banner.
 */
export function CoachPlanBanner() {
  const { state, daysLeft } = useCoachPlan();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const lapsed = state === 'expired' || state === 'suspended';
  const endingSoon = state === 'active' && daysLeft != null && daysLeft <= 5;
  if (!lapsed && !endingSoon) return null;

  const tone = lapsed ? 'border-danger/50 bg-danger/10 text-danger' : 'border-warn/50 bg-warn/10 text-warn';
  const msg = lapsed
    ? t(state === 'suspended' ? 'coachPlan.banner.suspended' : 'coachPlan.banner.expired')
    : t('coachPlan.banner.endingSoon', { n: Math.max(0, daysLeft ?? 0) });

  return (
    <div className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 ${tone}`} data-testid="coach-plan-banner">
      <Icon name={lapsed ? 'info' : 'timer'} size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium">{msg}</p>
      <button type="button" className="btn-ghost h-9 shrink-0 px-3 text-[13px]" data-testid="coach-plan-renew" onClick={() => navigate('/coach/plan')}>
        {t('coachPlan.banner.renew')}
      </button>
    </div>
  );
}
