import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { getMyPlanRequests, isActionable } from '@/services/platform/coachPlanRequestsApi';
import { capacityOf } from '@/services/platform/coachPlanApi';
import { useCoachPlan } from './CoachPlanProvider';

/**
 * App-wide coach notices, all pointing to My Plan:
 *  - danger: the Trial / subscription has ended, or the account is suspended
 *  - warn:   a PAID term ends within 5 days (the Trial has its own dashboard countdown)
 *  - warn:   over client capacity (e.g. an add-on expired) — existing clients stay
 *  - info:   a request is awaiting payment confirmation
 * None of these change what the coach is entitled to; they only explain it.
 */
export function CoachPlanBanner() {
  const { plan, state, daysLeft } = useCoachPlan();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reqQ = useQuery({ queryKey: ['coachPlanRequests', 'mine'], queryFn: getMyPlanRequests, refetchInterval: 60_000 });
  const openReqs = (reqQ.data ?? []).filter(isActionable);
  const cap = capacityOf(plan);

  const lapsed = state === 'expired' || state === 'suspended';
  const endingSoon = state === 'active' && daysLeft != null && daysLeft <= 5;
  const overCap = !lapsed && cap.over > 0;

  const go = () => navigate('/coach/plan');
  const banner = (tone: 'danger' | 'warn' | 'brand', icon: 'info' | 'timer' | 'user' | 'bolt', text: string, cta: string, testId: string) => (
    <div
      key={testId}
      className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 ${tone === 'danger' ? 'border-danger/50 bg-danger/10 text-danger' : tone === 'warn' ? 'border-warn/50 bg-warn/10 text-warn' : 'border-brand/40 bg-brand/10 text-brand'}`}
      data-testid={testId}
    >
      <Icon name={icon} size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium">{text}</p>
      <button type="button" className="btn-ghost h-9 shrink-0 px-3 text-[13px]" data-testid={`${testId}-cta`} onClick={go}>
        {cta}
      </button>
    </div>
  );

  const items = [];
  if (lapsed) {
    items.push(banner('danger', 'info', t(state === 'suspended' ? 'forma.banner.suspended' : plan?.phase === 'trial' ? 'forma.banner.trialEnded' : 'forma.banner.expired'), t(state === 'suspended' ? 'forma.viewPlan' : 'forma.renew'), 'coach-plan-banner'));
  } else if (endingSoon) {
    items.push(banner('warn', 'timer', t('forma.banner.endingSoon', { n: Math.max(0, daysLeft ?? 0) }), t('forma.renew'), 'coach-plan-banner'));
  }
  if (overCap) items.push(banner('warn', 'user', t('forma.banner.overCapacity', { used: cap.used, limit: cap.limit, over: cap.over }), t('forma.addCapacity'), 'coach-capacity-banner'));
  if (openReqs.length) items.push(banner('brand', 'bolt', t('forma.banner.requestAwaiting', { count: openReqs.length }), t('forma.viewPlan'), 'coach-plan-request-banner'));
  return items.length ? <>{items}</> : null;
}
