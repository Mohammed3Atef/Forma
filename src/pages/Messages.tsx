import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageThread } from '@/components/MessageThread';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { useBack } from '@/hooks/useBack';

/** Client ↔ coach chat thread. */
export function Messages() {
  const { t } = useTranslation();
  const goBack = useBack('/');
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const coach = useQuery({ queryKey: ['myCoach', coachId], queryFn: () => fetchMyCoach(coachId!), enabled: cloudAvailable() && !!coachId });

  return (
    <div className="anim-rise -mb-28 flex h-[calc(100dvh-8.5rem)] flex-col">
      {/* Elevated header band — a distinct warm-charcoal surface from the sunken
          chat canvas below, instead of blending into the page background. */}
      <div className="-mx-5 border-b border-line bg-surface-raised px-5">
        <TopBar
          title={coach.data?.displayName || t('coachInfo.yourCoach')}
          avatar={{ name: coach.data?.displayName || t('coachInfo.yourCoach'), photoUrl: coach.data?.photoUrl }}
          onBack={goBack}
          dense
        />
      </div>
      {!coachId ? (
        <div className="px-5" data-testid="messages-no-coach">
          <EmptyState icon="chat" title={t('clientCoach.noCoachTitle')} message={t('clientCoach.noCoachMessage')} />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <MessageThread clientId={uid} meId={uid} meRole="client" peer={{ name: coach.data?.displayName, photoUrl: coach.data?.photoUrl }} />
        </div>
      )}
    </div>
  );
}
