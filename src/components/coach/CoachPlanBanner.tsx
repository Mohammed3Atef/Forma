import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';
import { getMyPlanRequests, isActionable } from '@/services/platform/coachPlanRequestsApi';
import { capacityOf } from '@/services/platform/coachPlanApi';
import { useCoachPlan } from './CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { useGuardedNav } from '@/hooks/useGuardedNav';

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
  // The banner sits above every coach screen — its CTA must not drop an editor's work (NAV-K05).
  const navigate = useGuardedNav();
  const uid = useSession((s) => s.uid);
  const reqQ = useQuery({ queryKey: ['coachPlanRequests', 'mine', uid], queryFn: getMyPlanRequests, refetchInterval: 60_000 });
  const openReqs = (reqQ.data ?? []).filter(isActionable);
  const cap = capacityOf(plan);

  const lapsed = state === 'expired' || state === 'suspended';
  const endingSoon = state === 'active' && daysLeft != null && daysLeft <= 5;
  const overCap = !lapsed && cap.over > 0;

  // Three banner-region slots (B1.4): the region shows the most important one.
  const showPlan = useBannerSlot('coach-plan', lapsed ? BANNER_PRIORITY.coachPlanLapsed : BANNER_PRIORITY.coachPlanEnding, lapsed || endingSoon);
  const showCap = useBannerSlot('coach-capacity', BANNER_PRIORITY.coachOverCapacity, overCap);
  const showReq = useBannerSlot('coach-plan-request', BANNER_PRIORITY.coachPlanRequest, openReqs.length > 0);

  const go = () => navigate('/coach/plan');
  const banner = (tone: 'danger' | 'warning' | 'brand', icon: 'info' | 'timer' | 'user' | 'bolt', text: string, cta: string, testId: string) => (
    <Banner
      key={testId}
      tone={tone}
      icon={icon}
      testId={testId}
      action={
        <Button variant="ghost" size="sm" data-testid={`${testId}-cta`} onClick={go}>
          {cta}
        </Button>
      }
    >
      <span className="font-medium">{text}</span>
    </Banner>
  );

  const items = [];
  if (showPlan && lapsed) {
    items.push(banner('danger', 'info', t(state === 'suspended' ? 'forma.banner.suspended' : plan?.phase === 'trial' ? 'forma.banner.trialEnded' : 'forma.banner.expired'), t(state === 'suspended' ? 'forma.viewPlan' : 'forma.renew'), 'coach-plan-banner'));
  } else if (showPlan && endingSoon) {
    items.push(banner('warning', 'timer', t('forma.banner.endingSoon', { n: Math.max(0, daysLeft ?? 0) }), t('forma.renew'), 'coach-plan-banner'));
  }
  if (showCap) items.push(banner('warning', 'user', t('forma.banner.overCapacity', { used: cap.used, limit: cap.limit, over: cap.over }), t('forma.addCapacity'), 'coach-capacity-banner'));
  if (showReq) items.push(banner('brand', 'bolt', t('forma.banner.requestAwaiting', { count: openReqs.length }), t('forma.viewPlan'), 'coach-plan-request-banner'));
  return items.length ? <>{items}</> : null;
}
