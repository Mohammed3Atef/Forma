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
  if (!plan || plan.phase !== 'trial') return null; // the server's phase (B3.8 D6), never the legacy tier field
  const left = trialDaysLeft(plan);
  const expired = plan.status !== 'active' || (left != null && left <= 0);
  const urgent = !expired && left != null && left <= 7;
  // B3.9 (VS-05 / B33-R1): a running trial is information, not the brand orange (kept for the one action);
  // the expired line uses the AA-safe danger text token on its tint.
  const tone = expired ? 'border-danger/50 bg-danger/10 text-danger-text' : urgent ? 'border-warn/50 bg-warn/10 text-warn' : 'border-info/40 bg-info/10 text-info';
  // B3.8 D5: the server's count — the same number Clients, Forma subscription and the add-client block show.
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
