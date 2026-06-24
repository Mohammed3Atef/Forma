import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/hooks/useSubscription';

const TEXT: Record<string, { key: string; danger: boolean }> = {
  frozen: { key: 'subscription.bannerFrozen', danger: false },
  ended: { key: 'subscription.bannerEnded', danger: true },
  expired: { key: 'subscription.bannerExpired', danger: true },
  cancelled: { key: 'subscription.bannerCancelled', danger: true },
};

/** Notice shown to the client when their subscription is read-only. */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { status, access } = useSubscription();
  if (access !== 'readonly') return null;
  const cfg = TEXT[status] ?? TEXT.ended;
  return (
    <div
      data-testid="subscription-banner"
      className={`mb-3 rounded-xl border px-3 py-2 text-[13px] ${cfg.danger ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/40 bg-warn/10 text-warn'}`}
    >
      {t(cfg.key)}
    </div>
  );
}
