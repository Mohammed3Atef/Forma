import type { QueryClient } from '@tanstack/react-query';
import { listAllRelationshipsForCoach } from './coachClientsApi';
import { listMyClients } from './coachApi';
import type { CoachClientRelationship, UserRecord } from '@/types';

export interface CoachBusinessData {
  /** Every relationship this coach has had — current and former, with archived terms (`lib/coachBusiness`). */
  rels: CoachClientRelationship[];
  /** Current clients (names for the lists and exports). */
  roster: UserRecord[];
}

/**
 * Me › Business (B3.8): two bounded reads, no polling. Replaces the old dashboard aggregate that
 * Revenue and Reports shared — it also downloaded both template lists and the unread count, which
 * Business never shows. Anything that changes a relationship or a term invalidates
 * `['coachBusiness', coachId]` (`invalidateSubscription`, transfers, add / release a client).
 * B3.9 (PF-07): the roster is the shared `['myClients', coachId]` entry Today / Clients / Messages
 * already hold — read from that cache when it is there, not downloaded a second time.
 */
export function coachBusinessQuery(coachId: string | undefined, qc?: QueryClient) {
  return {
    queryKey: ['coachBusiness', coachId] as const,
    queryFn: async (): Promise<CoachBusinessData> => {
      const roster = qc
        ? qc.ensureQueryData({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId!), staleTime: 60_000 })
        : listMyClients(coachId!);
      const [rels, clients] = await Promise.all([listAllRelationshipsForCoach(coachId!), roster]);
      return { rels, roster: clients };
    },
    enabled: !!coachId,
    staleTime: 60_000,
  };
}
