import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageThread } from '@/components/MessageThread';
import { CoachNav } from '@/components/client/CoachNav';
import { useSession } from '@/services/auth/sessionStore';
import { useMyCoach } from '@/hooks/useMyCoach';
import { useFillToBottomNav } from '@/hooks/useFillToBottomNav';

/*
 * COACH › CHAT (B2.6) — the Coach tab's root. The shell header shows who the
 * coach is (avatar + name); this screen is the section switcher and the thread.
 * The thread engine (outbox, retries, receipts, voice, attachments) is the
 * B0/B1 `MessageThread`. B3.0.1: the thread writes to the CURRENT coach's
 * conversation; earlier coaches' conversations are shown apart, read-only. The column ends exactly at the tab bar
 * (phones / tablets) or near the window edge (≥ 1024 px, side rail).
 */
export function Messages() {
  const { t } = useTranslation();
  const uid = useSession((s) => s.uid) ?? '';
  const { coachId, name, photoUrl } = useMyCoach();
  const fill = useFillToBottomNav('1rem', 1024);

  return (
    <div ref={fill.ref} className="mx-auto -mb-[calc(var(--bottomnav-h)+2.5rem)] flex max-w-3xl flex-col" style={{ height: fill.height }} data-testid="client-messages">
      <CoachNav />
      {!coachId ? (
        <>
          <div className="pt-6" data-testid="messages-no-coach">
            <EmptyState icon="chat" title={t('clientCoach.noCoachTitle')} message={t('clientCoach.noCoachMessage')} />
          </div>
          {/* B3.0.1: earlier coach conversations stay readable (read-only, no composer); renders nothing when there are none. */}
          {uid && (
            <div className="mt-3 min-h-0 flex-1">
              <MessageThread clientId={uid} meId={uid} meRole="client" conversationCoachId={null} />
            </div>
          )}
        </>
      ) : (
        <div className="mt-3 min-h-0 flex-1">
          <MessageThread clientId={uid} meId={uid} meRole="client" peer={{ name: name || undefined, photoUrl }} conversationCoachId={coachId} />
        </div>
      )}
    </div>
  );
}
