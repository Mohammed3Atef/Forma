import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { ClientActivityView } from './ClientActivityView';
import { useBack } from '@/hooks/useBack';

export function CoachClientActivity() {
  const { t } = useTranslation();
  const { clientId = '' } = useParams();
  const goBack = useBack(`/coach/client/${clientId}`);
  return (
    <>
      <TopBar title={t('activity.title')} eyebrow={t('platform.coachPortal')} onBack={goBack} />
      <ClientActivityView clientId={clientId} />
    </>
  );
}
