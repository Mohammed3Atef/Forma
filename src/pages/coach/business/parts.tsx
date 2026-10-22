import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState } from '@/components/ui/ScreenState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWriteGate as useSharedWriteGate } from '@/components/coach/CoachPlanProvider';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { formatMoney } from '@/lib/format';
import type { UserRecord } from '@/types';

/** What every Business tab gets from the screen. */
export interface BusinessTabProps {
  coachId: string;
}

/** Writes (renew, packages) need the network and a Forma plan that has not lapsed; reading stays open. */
export function useWriteGate() {
  // B3.8 (P2): the coach app's one write gate (plan + connection).
  const { canWrite, reason } = useSharedWriteGate();
  return { canWrite, reason };
}

/**
 * "EGP 900" / "900 ج.م." — B3.8: Egyptian pounds the way each language writes them (Latin digits,
 * C20); a pre-B3.8 test term in another currency keeps its own code and is never added to EGP.
 */
export function Money({ amount, currency, testId }: { amount: number; currency?: string | undefined; testId?: string }) {
  const { i18n } = useTranslation();
  return (
    <span dir="ltr" className="tabular-nums" data-testid={testId}>
      {formatMoney(amount, currency, i18n.language)}
    </span>
  );
}

/** Current clients by id → their name (former clients are not on the roster). */
export function namesOf(roster: UserRecord[] | undefined): Map<string, string> {
  return new Map((roster ?? []).map((c) => [c.id, c.displayName || c.email || c.id]));
}

/** Loading / failed / offline for a Business tab — data is never replaced by an error, offline is never "empty" (C21). */
export function TabState({ q, testId, children }: { q: UseQueryResult<unknown>; testId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  if (q.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" data-testid={`${testId}-loading`}>
        <Skeleton className="h-32 w-full rounded-ui-surface" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-ui-control" />
        ))}
      </div>
    );
  }
  if (q.isError && !q.data) {
    return online ? <ErrorState message={t('business.loadFailed')} onRetry={() => void q.refetch()} testId="coach-business-error" /> : <OfflineState onRetry={() => void q.refetch()} testId="coach-business-offline" />;
  }
  return <>{children}</>;
}
