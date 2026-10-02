import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CoachCommercialOverview } from '@/types';

const getMyCommercialOverview = vi.fn();
const submitCapacityRequest = vi.fn();
const submitSubscriptionRequest = vi.fn();
vi.mock('@/services/platform/coachCommercialApi', () => ({ getMyCommercialOverview: () => getMyCommercialOverview() }));
vi.mock('@/services/platform/coachPlanRequestsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachPlanRequestsApi')>()),
  submitCapacityRequest: (id: string) => submitCapacityRequest(id),
  submitSubscriptionRequest: () => submitSubscriptionRequest(),
  cancelPlanRequest: vi.fn(),
}));
vi.mock('@/stores/dialogStore', () => ({ confirmDialog: vi.fn(async () => true), alertDialog: vi.fn(async () => undefined) }));

import { CoachPlan } from './CoachPlan';

const DAY = 86_400_000;
const now = Date.now();
const config = {
  key: 'forma', label: 'Forma', trialEnabled: true, trialDurationDays: 15, trialClientLimit: null, maxClients: 25, priceMonthly: 499, currency: 'EGP',
  billingInterval: 'month', termDays: 30, publicVisible: true, signupEnabled: true,
  marketingTitle: { en: 'Forma', ar: 'فورما' }, marketingDescription: { en: 'd', ar: 'd' }, marketingFeatures: { en: ['x'], ar: ['x'] }, createdAt: 0, updatedAt: 0,
} as const;
const plan = (o: Record<string, unknown> = {}) => ({
  coachId: 'c1', plan: 'forma', phase: 'forma', state: 'active', status: 'active', maxClients: 25, baseMaxClients: 25, addonClientCapacity: 0, manualCapacityAdjustment: 0,
  startedAt: now - DAY, endsAt: now + 29 * DAY, activeClientCount: 10, createdAt: 0, updatedAt: 0,
  subscription: { priceMonthly: 499, currency: 'EGP', billingInterval: 'month', termDays: 30, maxClients: 25, requestId: 'r0' }, ...o,
});
const offer = { id: 'p20', name: { en: '+20 clients', ar: '+20' }, description: null, badge: { en: 'Popular', ar: 'شائع' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1, promotional: false, validUntil: null };
const overview = (o: Partial<CoachCommercialOverview> = {}): CoachCommercialOverview =>
  ({ config, plan: plan(), activeEntitlements: [], pastEntitlements: [], requests: [], availablePackages: [offer], ...o }) as unknown as CoachCommercialOverview;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CoachPlan />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getMyCommercialOverview.mockReset();
  submitCapacityRequest.mockReset();
  submitSubscriptionRequest.mockReset();
});

describe('Coach My Plan', () => {
  it('shows the base capacity breakdown and usage', async () => {
    getMyCommercialOverview.mockResolvedValue(overview());
    renderPage();
    expect(await screen.findByTestId('plan-capacity-usage')).toHaveTextContent('10 / 25');
    expect(screen.getByTestId('plan-capacity-breakdown')).toHaveTextContent('25');
    expect(screen.queryByTestId('plan-over-capacity')).toBeNull();
    expect(screen.getByTestId('plan-phase')).toHaveTextContent('Forma Subscription');
  });

  it('lists active add-ons with their snapshot and end date', async () => {
    getMyCommercialOverview.mockResolvedValue(
      overview({
        plan: plan({ maxClients: 45, addonClientCapacity: 20 }) as never,
        activeEntitlements: [{ id: 'e1', coachId: 'c1', sourcePackageId: 'p20', source: 'request', status: 'active', startsAt: now, endsAt: now + 30 * DAY, requestId: 'r1', confirmedBy: 'sa', createdAt: 0, updatedAt: 0, snapshot: { packageId: 'p20', name: { en: '+20 clients', ar: '+20' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1 } }],
      }),
    );
    renderPage();
    const row = await screen.findByTestId('plan-active-addon');
    expect(row).toHaveTextContent('+20 clients · +20');
    expect(row).toHaveTextContent('199 EGP / month');
    expect(screen.getByTestId('plan-capacity-usage')).toHaveTextContent('10 / 45');
  });

  it('shows available packages and requests one after confirmation', async () => {
    getMyCommercialOverview.mockResolvedValue(overview());
    submitCapacityRequest.mockResolvedValue({ id: 'r9' });
    renderPage();
    const card = await screen.findByTestId('plan-offer');
    expect(card).toHaveTextContent('+20');
    expect(card).toHaveTextContent('Popular');
    fireEvent.click(within(card).getByTestId('plan-offer-request'));
    await waitFor(() => expect(submitCapacityRequest).toHaveBeenCalledWith('p20'));
  });

  it('an awaiting add-on request shows "awaiting payment" instead of the request button', async () => {
    getMyCommercialOverview.mockResolvedValue(
      overview({
        requests: [{ id: 'r1', coachId: 'c1', type: 'capacity_addon', status: 'awaiting', requestedAt: now, confirmationDeadline: now + 10 * 3_600_000, capacitySnapshot: { packageId: 'p20', name: { en: '+20 clients', ar: '+20' }, additionalClients: 20, price: 199, currency: 'EGP', billingInterval: 'month', durationMonths: 1 } }],
      }),
    );
    renderPage();
    const card = await screen.findByTestId('plan-offer');
    expect(within(card).queryByTestId('plan-offer-request')).toBeNull();
    expect(card).toHaveTextContent('Awaiting payment confirmation');
    expect(screen.getByTestId('plan-request-row')).toHaveTextContent('Awaiting payment');
    // Capacity is unchanged by an unconfirmed request.
    expect(screen.getByTestId('plan-capacity-usage')).toHaveTextContent('10 / 25');
  });

  it('over capacity: shows "38 / 25" and "Over capacity by 13"', async () => {
    getMyCommercialOverview.mockResolvedValue(overview({ plan: plan({ activeClientCount: 38 }) as never }));
    renderPage();
    expect(await screen.findByTestId('plan-capacity-usage')).toHaveTextContent('38 / 25');
    expect(screen.getByTestId('plan-over-capacity')).toHaveTextContent('Over capacity by 13');
  });

  it('an ended Trial offers "Subscribe to Forma" and hides add-on offers', async () => {
    getMyCommercialOverview.mockResolvedValue(overview({ plan: plan({ plan: 'trial', phase: 'trial', state: 'expired', status: 'expired', endsAt: now - DAY, subscription: undefined }) as never }));
    submitSubscriptionRequest.mockResolvedValue({ id: 'r2' });
    renderPage();
    const btn = await screen.findByTestId('plan-request-subscription');
    expect(btn).toHaveTextContent('Subscribe to Forma');
    expect(screen.queryByTestId('plan-offer')).toBeNull();
    fireEvent.click(btn);
    await waitFor(() => expect(submitSubscriptionRequest).toHaveBeenCalled());
  });

  it('a failed load shows a retry state', async () => {
    getMyCommercialOverview.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByTestId('coach-plan-error')).toBeInTheDocument();
  });
});
