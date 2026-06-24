import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { trialDaysLeft } from '@/services/platform/coachPlanApi';
import type { CoachPlan } from '@/types';

/**
 * Dashboard banner summarising the coach's trial: clients used / max and days
 * left, with an urgent tone inside the final week. Hidden for non-trial plans.
 */
export function CoachTrialBanner({ plan }: { plan: CoachPlan | null | undefined }) {
  const { t } = useTranslation();
  if (!plan || plan.plan !== 'trial') return null;
  const left = trialDaysLeft(plan);
  const expired = plan.status !== 'active' || (left != null && left <= 0);
  const urgent = !expired && left != null && left <= 7;
  const tone = expired ? 'border-danger/50 bg-danger/10 text-danger' : urgent ? 'border-warn/50 bg-warn/10 text-warn' : 'border-brand/40 bg-brand/10 text-brand';
  const used = plan.activeClientCount ?? 0;

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${tone}`} data-testid="coach-trial-banner">
      <Icon name={expired ? 'info' : 'timer'} size={20} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold" data-testid="coach-trial-status">
          {expired ? t('coachTrial.expired') : left != null ? t('coachTrial.daysLeft', { n: Math.max(0, left) }) : t('coachTrial.active')}
        </p>
        <p className="text-[12px] opacity-90" data-testid="coach-trial-usage">
          {t('coachTrial.usage', { used, max: plan.maxClients })}
        </p>
      </div>
    </div>
  );
}
