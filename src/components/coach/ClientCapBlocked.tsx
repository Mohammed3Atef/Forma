import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCoachPlan } from './CoachPlanProvider';

/**
 * Why the coach can't take on another client right now — an ended / suspended
 * subscription (renew) is a different problem from full client capacity
 * (add capacity). Existing clients are never affected either way.
 */
export function ClientCapBlocked({ maxClients, used, testId }: { maxClients: number; used?: number; testId: string }) {
  const { t } = useTranslation();
  const { state } = useCoachPlan();
  const lapsed = state === 'expired' || state === 'suspended';
  const over = used != null ? Math.max(0, used - maxClients) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-warn/50 bg-warn/10 px-3 py-2.5" data-testid={testId}>
      <p className="text-sm text-warn">
        {state === 'suspended'
          ? t('forma.reason.SUBSCRIPTION_SUSPENDED')
          : lapsed
            ? t('forma.reason.SUBSCRIPTION_EXPIRED')
            : over > 0
              ? t('forma.capacity.limitOver', { max: maxClients, over })
              : t('forma.capacity.limitBody', { max: maxClients })}
      </p>
      {state !== 'suspended' && (
        <Link to="/coach/plan" className="btn-tonal btn-sm inline-flex" data-testid={`${testId}-cta`}>
          {lapsed ? t('forma.renew') : t('forma.addCapacity')}
        </Link>
      )}
    </div>
  );
}
