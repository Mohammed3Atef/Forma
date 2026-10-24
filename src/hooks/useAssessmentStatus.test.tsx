import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const fetchMyAssessment = vi.fn(async () => {
  throw new TypeError('Failed to fetch'); // offline
});
vi.mock('@/services/platform/clientCoachApi', () => ({ fetchMyAssessment: () => fetchMyAssessment() }));

import { useAssessmentStatus } from './useAssessmentStatus';
import { useSession } from '@/services/auth/sessionStore';
import type { UserRecord } from '@/types';

/** A screen that shares the ['assessment', uid] key (like Settings / Progress). */
function SharingScreen() {
  useQuery({ queryKey: ['assessment', 'client-1'], queryFn: () => fetchMyAssessment(), retry: false });
  return <p data-testid="screen">screen</p>;
}
function Gate() {
  const { isLoading } = useAssessmentStatus();
  const [renders] = useState(() => ({ n: 0 }));
  renders.n += 1;
  return isLoading ? <p data-testid="splash">splash</p> : <SharingScreen />;
}

describe('assessment gate (offline deep link)', () => {
  it('after the first failed read the gate never returns to the splash (no remount loop)', async () => {
    useSession.setState({ phase: 'ready', uid: 'client-1', account: { id: 'client-1', role: 'client' } as UserRecord });
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
    render(
      <QueryClientProvider client={qc}>
        <Gate />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('splash')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('screen')).toBeInTheDocument());
    const calls = fetchMyAssessment.mock.calls.length;
    await new Promise((r) => setTimeout(r, 150));
    // The sharing screen's mount refetch must not flip the gate back to the splash.
    expect(screen.queryByTestId('splash')).toBeNull();
    expect(screen.getByTestId('screen')).toBeInTheDocument();
    expect(fetchMyAssessment.mock.calls.length).toBeLessThanOrEqual(calls + 2);
  });
});
