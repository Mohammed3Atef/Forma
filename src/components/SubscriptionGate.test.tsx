import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const fetchMyRelationship = vi.fn();
vi.mock('@/services/platform/clientCoachApi', () => ({ fetchMyRelationship: (...a: unknown[]) => fetchMyRelationship(...a) }));
vi.mock('@/data/dataSource', () => ({ cloudAvailable: () => true }));

import { useSession } from '@/services/auth/sessionStore';
import { SubscriptionGate } from './SubscriptionGate';

/**
 * C-2: a FAILED subscription read (offline PWA, 5xx) used to be treated as
 * "no subscription" and replaced the client's plan screens with the
 * "subscription pending" wall. Only a successful read may gate.
 */
function renderGate() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SubscriptionGate>
          <p>plan content</p>
        </SubscriptionGate>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchMyRelationship.mockReset();
  useSession.setState({ uid: 'client-1', account: { id: 'client-1', role: 'client', accountStatus: 'active', assignedCoachId: 'coach-1' } as never });
});

describe('SubscriptionGate', () => {
  it('a failed read keeps full access', async () => {
    fetchMyRelationship.mockRejectedValue(new Error('offline'));
    renderGate();
    await waitFor(() => expect(fetchMyRelationship).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('plan content')).toBeInTheDocument());
    expect(screen.queryByTestId('subscription-pending')).toBeNull();
  });

  it('a successful read with no subscription still gates', async () => {
    fetchMyRelationship.mockResolvedValue({ subscription: null });
    renderGate();
    expect(await screen.findByTestId('subscription-pending')).toBeInTheDocument();
  });

  it('an active subscription shows the plan', async () => {
    fetchMyRelationship.mockResolvedValue({ subscription: { status: 'active', startAt: Date.now() - 1000, endAt: Date.now() + 86_400_000 * 30, updatedAt: Date.now() } });
    renderGate();
    await waitFor(() => expect(fetchMyRelationship).toHaveBeenCalled());
    expect(await screen.findByText('plan content')).toBeInTheDocument();
    expect(screen.queryByTestId('subscription-pending')).toBeNull();
  });
});
