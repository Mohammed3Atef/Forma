import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { listMyClients, listClientDashboardSummaries, listPendingFreezeRequests } from '@/services/platform/coachApi';
import { listActiveRelationshipsSummary } from '@/services/platform/coachClientsApi';
import { listCheckInsForCoachClients } from '@/services/platform/checkInApi';
import { refreshCoachThreadsSummary, subscribeCoachThreadsSummary, type CoachThreadSummary } from '@/services/platform/messagesApi';
import { incomingTransfersQuery } from '@/services/platform/transferApi';
import type { SourceState, TodaySources } from '@/lib/coachToday';

/**
 * Everything Today (B3.2) and Clients (B3.3) read about the coach's roster, as separate sources so one failure only
 * blanks the kinds that need it (`KIND_SOURCES`). Query keys are the ones the
 * other coach screens already use, so caches are shared, not duplicated.
 * Threads come from the app-wide shared poller (20 s) — Today adds no second
 * poll. Freeze requests come from their canonical documents (B32-P1), not
 * the notification feed. The queue queries refresh every 60 s while Today is
 * open and visible, on focus, and right after the actions that change them.
 */
export const TODAY_REFRESH_MS = 60_000;
/** Returning to Today after acting elsewhere refetches anything older than this. */
const TODAY_STALE_MS = 10_000;

function fromQuery<T>(q: UseQueryResult<T>): SourceState<T> {
  return { data: q.data, error: q.isError || (q.data !== undefined && q.isRefetchError), paused: q.fetchStatus === 'paused' };
}

function useCoachThreads(coachId: string): { state: SourceState<CoachThreadSummary[]>; updatedAt: number } {
  const [rows, setRows] = useState<CoachThreadSummary[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  useEffect(() => {
    if (!coachId) return;
    return subscribeCoachThreadsSummary(
      coachId,
      (r) => {
        setRows(r);
        setUpdatedAt(Date.now());
      },
      undefined,
      setFailed,
    );
  }, [coachId]);
  return { state: { data: rows, error: failed }, updatedAt };
}

export interface CoachSourcesData {
  sources: TodaySources;
  /** Oldest successful load among the timed sources (for "Updated hh:mm"); 0 until all have loaded once. */
  updatedAt: number;
  refreshing: boolean;
  refresh: () => void;
}

export function useCoachSources(coachId: string): CoachSourcesData {
  const live = { enabled: !!coachId, staleTime: TODAY_STALE_MS, refetchInterval: TODAY_REFRESH_MS } as const;
  const roster = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), ...live });
  // Active relationships only, without the audit trail (`view: 'summary'`, B3.3) — the roster screens need the current term.
  const relationships = useQuery({ queryKey: ['coachRelationships', coachId], queryFn: () => listActiveRelationshipsSummary(coachId), ...live });
  const summaries = useQuery({ queryKey: ['coachDashboardSummaries', coachId], queryFn: () => listClientDashboardSummaries(coachId), ...live });
  const checkIns = useQuery({ queryKey: ['coachCheckInSummaries', coachId], queryFn: () => listCheckInsForCoachClients(coachId), ...live });
  const transfers = useQuery({ ...incomingTransfersQuery(coachId), staleTime: TODAY_STALE_MS, refetchInterval: TODAY_REFRESH_MS });
  const freezeRequests = useQuery({ queryKey: ['coachFreezeRequests', coachId], queryFn: () => listPendingFreezeRequests(coachId), ...live });
  const threads = useCoachThreads(coachId);

  const queries = [roster, relationships, summaries, checkIns, transfers, freezeRequests];
  const sources: TodaySources = useMemo(
    () => ({
      roster: fromQuery(roster),
      relationships: fromQuery(relationships),
      summaries: fromQuery(summaries),
      checkIns: fromQuery(checkIns),
      transfers: fromQuery(transfers),
      threads: threads.state,
      freezeRequests: fromQuery(freezeRequests),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster.data, roster.isError, roster.isRefetchError, roster.fetchStatus, relationships.data, relationships.isError, relationships.isRefetchError, summaries.data, summaries.isError, summaries.isRefetchError, checkIns.data, checkIns.isError, checkIns.isRefetchError, transfers.data, transfers.isError, transfers.isRefetchError, freezeRequests.data, freezeRequests.isError, freezeRequests.isRefetchError, threads.state],
  );

  const stamps = [...queries.map((q) => q.dataUpdatedAt), threads.updatedAt];
  const updatedAt = stamps.every((s) => s > 0) ? Math.min(...stamps) : 0;
  const refreshing = queries.some((q) => q.isFetching);

  const refresh = useCallback(() => {
    for (const q of [roster, relationships, summaries, checkIns, transfers, freezeRequests]) void q.refetch();
    void refreshCoachThreadsSummary(coachId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, roster.refetch, relationships.refetch, summaries.refetch, checkIns.refetch, transfers.refetch, freezeRequests.refetch]);

  return { sources, updatedAt, refreshing, refresh };
}
