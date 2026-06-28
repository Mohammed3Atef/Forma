import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { MessageThread } from '@/components/MessageThread';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUser } from '@/services/platform/accountsApi';

/** Coach side of a 1:1 thread with one client. */
export function CoachMessageThread() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId = '' } = useParams();
  const account = useSession((s) => s.account);
  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const name = user.data?.displayName || user.data?.email || t('coach.client');

  return (
    <div className="anim-rise -mb-28 flex h-[calc(100dvh-8.5rem)] flex-col md:mb-0 md:h-[calc(100dvh-7rem)]">
      <TopBar
        title={name}
        eyebrow={t('coach.messages')}
        onBack={() => navigate('/coach/messages')}
        onTitleClick={() => navigate(`/coach/client/${clientId}`)}
        sticky
      />
      <div className="min-h-0 flex-1">
        <MessageThread clientId={clientId} meId={account?.id ?? ''} meRole={account?.role ?? 'coach'} peer={{ name, photoUrl: user.data?.photoUrl }} />
      </div>
    </div>
  );
}
