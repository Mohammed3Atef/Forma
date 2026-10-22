import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * B3.8 final (owner, B38F-R1, 2026-10-22): Admin › Subscriptions shows Forma's own recurring revenue —
 * confirmed coach subscriptions and monthly add-ons bought through a confirmed request — and nothing
 * from a coach's own clients (no "client subscriptions" figure, no total that adds them in).
 */
vi.mock('@/services/auth/permissions', () => ({ useRole: () => 'super_admin' }));
vi.mock('@/hooks/useFullBleed', () => ({ useFullBleed: () => undefined }));
vi.mock('@/services/platform/coachPlanRequestsApi', () => ({ listPendingPlanRequests: async () => [] }));
vi.mock('@/services/platform/adminGrowthApi', () => ({
  fetchGrowth: async () => ({ totalMembers: 3, newThisWeek: 0, newPrevWeek: 0, newThisMonth: 0, signupSeries: [], subBreakdown: {}, expiringClients: [] }),
}));
vi.mock('@/services/platform/adminCoachesApi', () => ({
  fetchCoachAdmin: async () => ({
    rows: [],
    totalCoaches: 4,
    trialCoaches: 1,
    activeCoaches: 2,
    expiredCoaches: 1,
    suspendedCoaches: 0,
    totalClients: 9,
    trackedRevenue: 998,
    unconfirmedPaidCoaches: 1,
    conversionRate: 50,
    recent: [],
    top: [],
    capacityRevenue: 150,
    grantedAddons: 2,
    overCapacityCoaches: 0,
    forma: { priceMonthly: 499, currency: 'EGP', maxClients: 25, termDays: 30 },
  }),
}));

import { AdminSubscriptions } from './AdminSubscriptions';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminSubscriptions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Admin › Subscriptions — Forma revenue only (B38F-R1)', () => {
  it('the hero is Forma recurring revenue = confirmed subscriptions + confirmed monthly add-ons, split by source', async () => {
    renderPage();
    expect(await screen.findByTestId('admin-forma-mrr')).toHaveTextContent('1148 EGP');
    expect(screen.getByText('Forma recurring revenue')).toBeVisible();
    const split = screen.getByTestId('admin-revenue-split');
    expect(split).toHaveTextContent('998 EGP');
    expect(split).toHaveTextContent('150 EGP');
  });

  it('nothing from coaches’ clients: no client-subscription figure and no total that adds one in', async () => {
    renderPage();
    await screen.findByTestId('admin-forma-mrr');
    expect(screen.queryByText(/Client subscriptions/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Total tracked MRR/i)).not.toBeInTheDocument();
  });

  it('says what is not counted: paid plans without a confirmed payment, add-ons granted without one', async () => {
    renderPage();
    expect(await screen.findByTestId('admin-revenue-excluded')).toHaveTextContent('1 active paid plan has no confirmed payment and is not counted. 2 add-ons granted without a payment are not revenue.');
  });
});
