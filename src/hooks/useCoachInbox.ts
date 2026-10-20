import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { listClientDashboardSummaries, listMyClients } from '@/services/platform/coachApi';
import { listActiveRelationshipsSummary } from '@/services/platform/coachClientsApi';
import { listCheckInsForCoachClients } from '@/services/platform/checkInApi';
import { refreshCoachThreadsSummary, subscribeCoachThreadsSummary, type CoachThreadSummary } from '@/services/platform/messagesApi';
import { buildDirectory, type DirectoryRow } from '@/lib/coachDirectory';
import type { SourceState } from '@/lib/coachToday';
import { today as todayKey, weekRange } from '@/lib/utils';

const NONE: SourceState<never> = { data: undefined, error: false };
const fromQuery = <T,>(q: UseQueryResult<T>): SourceState<T> => ({ data: q.data, error: q.isError });
/** The roster-wide reads behind names and the thread's context line change slowly — no extra polling here. */
const STALE_MS = 60_000;

/**
 * The data behind the coach's Messages (B3.6):
 *  - the roster (`['myClients', coachId]`, shared with Today, Clients and the toasts);
 *  - the thread summary from the app-wide shared poller (one request per 20 s
 *    for every subscriber, the nav badge included) — never a poll of its own;
 *    `threadsFailed` says the latest tick failed, so "no unread" is never
 *    shown for "couldn't load" (C21);
 *  - a Clients-directory row per client (same query keys and rules as
 *    Clients: the name the coach knows them by, package state, last workout,
 *    this week's check-in) for the inbox names and the thread's context line.
 */
export function useCoachInbox(coachId: string | undefined) {
  const id = coachId ?? '';
  const roster = useQuery({ queryKey: ['myClients', id], queryFn: () => listMyClients(id), enabled: !!id });
  const opts = { enabled: !!id, staleTime: STALE_MS } as const;
  const relationships = useQuery({ queryKey: ['coachRelationships', id], queryFn: () => listActiveRelationshipsSummary(id), ...opts });
  const summaries = useQuery({ queryKey: ['coachDashboardSummaries', id], queryFn: () => listClientDashboardSummaries(id), ...opts });
  const checkIns = useQuery({ queryKey: ['coachCheckInSummaries', id], queryFn: () => listCheckInsForCoachClients(id), ...opts });

  const [threads, setThreads] = useState<CoachThreadSummary[] | undefined>(undefined);
  const [threadsFailed, setThreadsFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    setThreads(undefined);
    return subscribeCoachThreadsSummary(id, setThreads, undefined, setThreadsFailed);
  }, [id]);
  const refreshThreads = useCallback(() => (id ? refreshCoachThreadsSummary(id) : Promise.resolve()), [id]);

  const day = todayKey();
  const directory = useMemo(
    () =>
      buildDirectory(
        { roster: fromQuery(roster), relationships: fromQuery(relationships), summaries: fromQuery(summaries), checkIns: fromQuery(checkIns), transfers: NONE, threads: NONE, freezeRequests: NONE },
        { coachId: id, now: Date.now(), todayKey: day, weekStart: weekRange(day).weekStart },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, day, roster.data, roster.isError, relationships.data, relationships.isError, summaries.data, summaries.isError, checkIns.data, checkIns.isError],
  );
  const rowOf = useCallback((clientId: string | null | undefined): DirectoryRow | null => (clientId ? directory.rows.find((r) => r.id === clientId) ?? null : null), [directory]);

  return { roster, threads, threadsFailed, refreshThreads, directory, rowOf };
}
