import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EntityNotesProvider } from '@/components/EntityNotes';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCoachNotes } from '@/services/platform/clientCoachApi';

/**
 * Supplies the signed-in client's coach notes (read-only) to every client screen
 * so `<EntityNotes>` can render coach feedback inline next to the matching entity.
 * No `onAdd` — clients never author notes.
 */
export function ClientNotesProvider({ children }: { children: ReactNode }) {
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = !!uid;
  const q = useQuery({ queryKey: ['coachNotes', uid], queryFn: () => fetchMyCoachNotes(uid), enabled });
  return <EntityNotesProvider notes={q.data ?? []}>{children}</EntityNotesProvider>;
}
