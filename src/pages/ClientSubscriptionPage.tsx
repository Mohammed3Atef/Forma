import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { ClientSubscriptionSection } from '@/components/ClientSubscriptionSection';
import { useBack } from '@/hooks/useBack';

/**
 * Subscription as its own destination — matches the design's nav rail, which
 * lists Subscription as a sibling of Settings rather than a section buried
 * inside Profile.
 */
export function ClientSubscriptionPage() {
  const { t } = useTranslation();
  const goBack = useBack('/settings');
  return (
    <div className="anim-rise space-y-4 pb-4">
      <TopBar title={t('subscription.title')} eyebrow={t('gt.athlete')} onBack={goBack} />
      <ClientSubscriptionSection />
    </div>
  );
}
