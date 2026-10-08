import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyAssessment } from '@/services/platform/clientCoachApi';
import { assessmentSubmitted } from '@/lib/assessment';

/**
 * Whether the signed-in client has submitted the mandatory onboarding
 * assessment (status `submitted` or `reviewed`). Disabled (and treated as "not
 * gating") in local-only mode.
 */
export function useAssessmentStatus() {
  const uid = useSession((s) => s.uid);
  const enabled = !!uid;
  const q = useQuery({
    queryKey: ['assessment', uid],
    queryFn: () => fetchMyAssessment(uid!),
    enabled,
    // Settle fast when offline so a returning client isn't stuck on the splash.
    retry: 1,
  });
  return {
    enabled,
    // Only the FIRST read may hold the app on the splash. React Query v5 puts a
    // query that has no data back to `pending` on every refetch, so once the
    // read has failed (offline) any screen sharing this key (Settings,
    // Progress) re-triggered the splash, unmounted itself, and looped forever
    // (found in the B0 offline deep-link check).
    isLoading: enabled && q.isLoading && !q.isFetched,
    submitted: assessmentSubmitted(q.data),
    // Only force the wizard on a DEFINITIVE "not submitted" read. An offline /
    // errored read must never re-trap a client who already submitted — it would
    // mount a full-screen overlay over the (cached) app.
    blocked: enabled && q.isSuccess && !assessmentSubmitted(q.data),
  };
}
