import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';

/** Soft notice shown to the client while their subscription is frozen or ended. */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { status } = useSubscription();
  if (status !== 'frozen' && status !== 'ended') return null;
  const ended = status === 'ended';
  return (
    <div
      data-testid="subscription-banner"
      className={`mb-3 rounded-xl border px-3 py-2 text-[13px] ${ended ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/40 bg-warn/10 text-warn'}`}
    >
      {t(ended ? 'subscription.bannerEnded' : 'subscription.bannerFrozen')}
    </div>
  );
}
