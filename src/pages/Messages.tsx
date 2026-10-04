import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { MessageThread } from '@/components/MessageThread';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoach } from '@/services/platform/clientCoachApi';
import { useBack } from '@/hooks/useBack';

/**
 * Height that makes the chat column end exactly at the top of the fixed
 * bottom nav, measured from the column's REAL top edge. A fixed
 * `100dvh - 8.5rem` assumed nothing renders above the thread — the
 * read-only subscription banner or a due-reminder banner pushed the composer
 * under the bottom nav, where it could not be tapped at all (release gate,
 * production). Re-measured whenever the page above changes size.
 */
function useFillToBottomNav() {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTop(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    measure();
    // Banners mount AFTER this page (their data loads later): watch the
    // containers they render into — <main> (subscription banner) and the
    // app shell (reminder banner) — for size changes and inserted nodes.
    const main = el.parentElement;
    const shell = main?.parentElement ?? null;
    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    for (const n of [main, shell]) {
      if (!n) continue;
      ro.observe(n);
      mo.observe(n, { childList: true });
    }
    for (const sib of Array.from(main?.children ?? [])) if (sib !== el) ro.observe(sib);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const height = top == null ? 'calc(100dvh - 8.5rem)' : `calc(100dvh - ${top}px - var(--bottomnav-h) - env(safe-area-inset-bottom, 0px))`;
  return { ref, height };
}

/** Client ↔ coach chat thread. */
export function Messages() {
  const { t } = useTranslation();
  const goBack = useBack('/');
  const uid = useSession((s) => s.uid) ?? '';
  const coachId = useSession((s) => s.account?.assignedCoachId);
  const coach = useQuery({ queryKey: ['myCoach', coachId], queryFn: () => fetchMyCoach(coachId!), enabled: cloudAvailable() && !!coachId });
  const fill = useFillToBottomNav();

  return (
    <div ref={fill.ref} className="anim-rise -mb-28 flex flex-col" style={{ height: fill.height }} data-testid="client-messages">
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
