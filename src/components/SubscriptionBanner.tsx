import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';
import { Banner } from '@/components/ui/Banner';
import { BANNER_PRIORITY, useBannerSlot } from '@/stores/bannerRegionStore';

const TEXT: Record<string, { key: string; danger: boolean }> = {
  frozen: { key: 'subscription.bannerFrozen', danger: false },
  ended: { key: 'subscription.bannerEnded', danger: true },
  expired: { key: 'subscription.bannerExpired', danger: true },
  cancelled: { key: 'subscription.bannerCancelled', danger: true },
};

/** Notice shown to the client when their subscription is read-only (a banner-region slot, B1.4). */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { status, access } = useSubscription();
  const show = useBannerSlot('subscription', BANNER_PRIORITY.subscription, access === 'readonly');
  if (!show) return null;
  const cfg = TEXT[status] ?? TEXT.ended;
  return (
    <Banner tone={cfg.danger ? 'danger' : 'warning'} testId="subscription-banner">
      {t(cfg.key)}
    </Banner>
  );
}
