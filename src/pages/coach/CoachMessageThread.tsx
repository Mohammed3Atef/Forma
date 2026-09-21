import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { MessageThread } from '@/components/MessageThread';
import { useSession } from '@/services/auth/sessionStore';
import { fetchUser } from '@/services/platform/accountsApi';
import { useBack } from '@/hooks/useBack';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';

/** Coach side of a 1:1 thread with one client. */
export function CoachMessageThread() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = useBack('/coach/messages');
  const { clientId = '' } = useParams();
  const account = useSession((s) => s.account);
  const user = useQuery({ queryKey: ['user', clientId], queryFn: () => fetchUser(clientId), enabled: !!clientId });
  const name = user.data?.displayName || user.data?.email || t('coach.client');
  // Real subscription/goal context, same cache-shared hook the desktop split
  // header and the client workspace already use — never fabricated presence.
  const { goal, daysLeft } = useCoachClientHeader(clientId);
  const subLine = [
    goal ? t(`settings.goals.${goal}`) : null,
    daysLeft != null ? t('subscription.daysLeft', { n: daysLeft }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="anim-rise -mb-28 flex h-[calc(100dvh-8.5rem)] flex-col md:mb-0 md:h-[calc(100dvh-7rem)]">
      {/* Elevated header band — a distinct warm-charcoal surface from the sunken
          chat canvas below, instead of blending into the page background. */}
      <div className="-mx-5 border-b border-line bg-surface-raised px-5">
        <TopBar
          title={name}
          sub={subLine || undefined}
          avatar={{ name, photoUrl: user.data?.photoUrl }}
          onBack={goBack}
          onTitleClick={() => navigate(`/coach/client/${clientId}`)}
          dense
          right={
            // A real, existing destination (not a fake call/video/presence
            // affordance) — also balances the header instead of leaving the
            // trailing half of the row empty.
            <button
              type="button"
              onClick={() => navigate(`/coach/client/${clientId}`)}
              className="icon-btn h-9 w-9 shrink-0"
              aria-label={t('coachDash.openWorkspace')}
            >
              <Icon name="user" size={18} />
            </button>
          }
        />
      </div>
      <div className="min-h-0 flex-1">
        <MessageThread clientId={clientId} meId={account?.id ?? ''} meRole={account?.role ?? 'coach'} peer={{ name, photoUrl: user.data?.photoUrl }} />
      </div>
    </div>
  );
}
