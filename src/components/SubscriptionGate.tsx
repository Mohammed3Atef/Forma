import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';

/**
 * Gates coach-plan pages for the client. When the subscription is `pending`
 * (or unset -> limited), the client sees a limited screen instead of plan
 * content and is pointed to their coach. Read-only states (expired/cancelled/
 * frozen/ended) still render the plan view-only with the SubscriptionBanner.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { access, loading } = useSubscription();
  if (loading || access !== 'limited') return <>{children}</>;
  return <SubscriptionPending />;
}

function SubscriptionPending() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="anim-rise py-12 text-center" data-testid="subscription-pending">
      <h1 className="h1 mb-2">{t('subscription.pendingTitle')}</h1>
      <p className="mx-auto max-w-sm text-sm text-earth-muted">{t('subscription.pendingBody')}</p>
      <button type="button" className="btn-primary mt-5" onClick={() => navigate('/messages')}>
        {t('subscription.contactCoach')}
      </button>
    </div>
  );
}
