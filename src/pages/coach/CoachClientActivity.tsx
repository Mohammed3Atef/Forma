import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { ClientActivityView } from './ClientActivityView';

export function CoachClientActivity() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId = '' } = useParams();
  return (
    <>
      <TopBar title={t('activity.title')} eyebrow={t('platform.coachPortal')} onBack={() => navigate(`/coach/client/${clientId}`)} />
      <ClientActivityView clientId={clientId} />
    </>
  );
}
