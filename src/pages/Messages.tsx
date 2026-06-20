import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { MessageThread } from '@/components/MessageThread';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';

/** Client ↔ coach chat thread. */
export function Messages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const coach = useQuery({ queryKey: ['myCoach', coachId], queryFn: () => fetchMyCoach(coachId!), enabled: cloudAvailable() && !!coachId });

  return (
    <div className="anim-rise">
      <TopBar title={t('messages.title')} eyebrow={coach.data?.displayName ?? t('coachInfo.yourCoach')} onBack={() => navigate('/')} sticky />
      {!coachId ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('clientCoach.signedOut')}</p>
      ) : (
        <MessageThread clientId={uid} meId={uid} meRole="client" />
      )}
    </div>
  );
}
