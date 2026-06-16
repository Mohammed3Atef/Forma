import { useQuery } from '@tanstack/react-query';
import { cloudAvailable } from '@/data/dataSource';
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
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const q = useQuery({
    queryKey: ['assessment', uid],
    queryFn: () => fetchMyAssessment(uid!),
    enabled,
    // Settle fast when offline so a returning client isn't stuck on the splash.
    retry: 1,
  });
  return {
    enabled,
    isLoading: enabled && q.isLoading,
    submitted: assessmentSubmitted(q.data),
    // Only force the wizard on a DEFINITIVE "not submitted" read. An offline /
    // errored read must never re-trap a client who already submitted — it would
    // mount a full-screen overlay over the (cached) app.
    blocked: enabled && q.isSuccess && !assessmentSubmitted(q.data),
  };
}
