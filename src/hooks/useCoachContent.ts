import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoachNotes, fetchMyCoachTargets } from '@/services/platform/clientCoachApi';

/**
 * Coach-authored content for the signed-in client (notes, assigned plans,
 * targets). Disabled in local-only mode / when signed out, so the client app
 * stays fully functional offline.
 */
export function useCoachContent() {
  const uid = useSession((s) => s.uid);
  const enabled = !!uid;
  const cid = uid ?? '';

  // Same key as ClientNotesProvider — one cache entry, one fetch (B0 / RM-84).
  const notes = useQuery({ queryKey: ['coachNotes', cid], queryFn: () => fetchMyCoachNotes(cid), enabled });
  const targets = useQuery({ queryKey: ['myCoachTargets', cid], queryFn: () => fetchMyCoachTargets(cid), enabled });

  const hasContent = enabled && ((notes.data?.length ?? 0) > 0 || !!targets.data);

  return { enabled, notes: notes.data ?? [], targets: targets.data ?? null, hasContent };
}
